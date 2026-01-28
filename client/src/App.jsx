import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Database, Server, Activity, Terminal, Shield, Zap, X, Users, PlayCircle, LogIn, Lock, UserCheck, Power, AlertOctagon, BookOpen, FileText, MonitorPlay } from 'lucide-react';

// Địa chỉ API Server (Docker Backend)
const API_URL = 'http://localhost:5000/api';

const App = () => {
  // --- STATE SYSTEM (REAL DATA) ---
  const [courses, setCourses] = useState([]); // Danh sách khóa học từ DB
  const [redisSlots, setRedisSlots] = useState({}); // Slot từ Redis
  const [dbCount, setDbCount] = useState(0); // Số đơn hàng trong DB

  // --- STATE UI ---
  const [logs, setLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [processingCourseId, setProcessingCourseId] = useState(null); 
  const [isStressTesting, setIsStressTesting] = useState(false);
  
  // --- STATE AUTH (CỔNG CHÀO) ---
  const [currentUser, setCurrentUser] = useState(null); // null = chưa vào, object = đã vào
  const [showLoginModal, setShowLoginModal] = useState(true); // Mặc định hiện modal
  const [isAuthServiceAlive, setIsAuthServiceAlive] = useState(true);
  
  const logsEndRef = useRef(null);

  // Auto scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // --- 1. LẤY DỮ LIỆU TỪ SERVER ---
  useEffect(() => {
    // Lấy danh sách khóa học
    const fetchCourses = async () => {
      try {
        const res = await fetch(`${API_URL}/courses`);
        if (res.ok) setCourses(await res.json());
      } catch (e) {
        console.error("Lỗi kết nối Server", e);
      }
    };
    fetchCourses();

    // Polling trạng thái Redis/DB
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/status`);
        if (res.ok) {
            const data = await res.json();
            setRedisSlots(data.redisSlots);
            setDbCount(data.dbCount);
        }
      } catch (e) { /* Silent fail */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const addLog = (source, message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), time: timestamp, source, message, type }]);
  };

  const showNotification = (msg, type) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  // --- LOGIC GIAO DỊCH (GỌI API THẬT) ---
  const processTransaction = async (courseId, userId) => {
    try {
        const response = await fetch(`${API_URL}/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId, userId })
        });
        const data = await response.json();

        if (data.success) {
            setRedisSlots(prev => ({ ...prev, [courseId]: data.remaining }));
            setDbCount(prev => prev + 1);
            addLog('REDIS', `✅ SUCCESS! Ticket: ${data.ticketId} (User: ${userId})`, 'success');
            
            if (!userId.startsWith('BOT_')) {
                showNotification(`Đăng ký thành công!`, 'success');
            }
            return true;
        } else {
            addLog('REDIS', `❌ FAILED! ${data.message} (User: ${userId})`, 'error');
            if (!userId.startsWith('BOT_')) {
                showNotification(`Hết vé!`, 'error');
            }
            return false;
        }
    } catch (e) {
        addLog('NETWORK', `🔥 Connection Error`, 'error');
        return false;
    }
  };

  // --- USER ACTION ---
  const handleBuyCourse = async (course) => {
    setProcessingCourseId(course.id);
    addLog('CLIENT', `User click Mua: "${course.title}"`, 'info');
    
    // Kiểm tra Auth (dù đã có Auth Wall nhưng check lại cho chắc)
    if (!currentUser) {
        setShowLoginModal(true);
        setProcessingCourseId(null);
        return;
    }

    const userId = currentUser.username;
    await new Promise(r => setTimeout(r, 300)); 
    await processTransaction(course.id, userId);
    setProcessingCourseId(null);
  };

  // --- STRESS TEST ---
  const handleStressTest = async () => {
    if (isStressTesting) return;
    setIsStressTesting(true);
    
    // Tìm khóa học để test (ưu tiên ID 4)
    const targetCourse = courses.find(c => c.id === 4) || courses[0];
    if (!targetCourse) {
        addLog('SYSTEM', 'Chưa có khóa học nào để test', 'error');
        setIsStressTesting(false);
        return;
    }

    const TOTAL_USERS = 100;
    addLog('SYSTEM', `🚀 START STRESS TEST: ${TOTAL_USERS} BOT users vào ID ${targetCourse.id}`, 'warning');
    
    const requests = Array.from({ length: TOTAL_USERS }, (_, i) => {
      return new Promise(async (resolve) => {
        await new Promise(r => setTimeout(r, Math.random() * 500));
        await processTransaction(targetCourse.id, `BOT_${i+1}`);
        resolve();
      });
    });

    await Promise.all(requests);
    addLog('SYSTEM', '🏁 END STRESS TEST.', 'warning');
    setIsStressTesting(false);
  };

  // --- RESET SYSTEM ---
  const handleReset = async () => {
    try {
        await fetch(`${API_URL}/reset`, { method: 'POST' });
        setLogs([]);
        setNotifications([]);
        addLog('SYSTEM', 'System Reset (Redis & DB Reloaded).', 'info');
        
        // Load lại data mới nhất
        const res = await fetch(`${API_URL}/courses`);
        if (res.ok) setCourses(await res.json());
    } catch (e) {
        addLog('SYSTEM', 'Reset Error', 'error');
    }
  };

  // --- AUTH HANDLERS ---
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (!isAuthServiceAlive) {
        showNotification("Auth Service Error! Fallback to Guest.", "error");
        return;
    }
    const username = e.target.username.value;
    setCurrentUser({ username, type: 'user' });
    setShowLoginModal(false);
    addLog('AUTH', `Đăng nhập: ${username}`, 'success');
  };

  const handleGuestLogin = () => {
      setCurrentUser({ username: `Guest_${Math.floor(Math.random()*100)}`, type: 'guest' });
      setShowLoginModal(false);
      addLog('AUTH', `Truy cập chế độ Khách`, 'warning');
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-sm overflow-hidden relative">
      
      {/* AUTH WALL (LOGIN MODAL) */}
      {(showLoginModal || !currentUser) && (
        <div className="absolute inset-0 z-50 bg-slate-900/90 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
             {/* Header Modal */}
             <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-center">
                <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-md">
                    <Users size={32} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Chào mừng đến với FamilyTECH</h2>
                <p className="text-blue-100 text-sm">Hệ thống Đăng ký Tín chỉ Phân tán (High Concurrency)</p>
             </div>

             {/* Body Modal */}
             <div className="p-8">
                {!isAuthServiceAlive ? (
                    <div className="text-center">
                         <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4 flex items-center gap-3">
                            <AlertOctagon size={24} />
                            <div className="text-left">
                                <p className="font-bold">Hệ thống Đăng nhập bảo trì</p>
                                <p className="text-xs">Vui lòng sử dụng chế độ Khách.</p>
                            </div>
                         </div>
                         <button onClick={handleGuestLogin} className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-bold shadow-lg transition-transform active:scale-95">
                            Tiếp tục với vai trò Khách &rarr;
                         </button>
                    </div>
                ) : (
                    <>
                        <form onSubmit={handleLoginSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tên tài khoản</label>
                                <input name="username" defaultValue="HocVien_01" className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 font-medium" autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mật khẩu</label>
                                <input type="password" value="******" disabled className="w-full border border-gray-300 rounded-lg p-3 bg-gray-50 text-gray-400" />
                            </div>
                            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg transition-transform active:scale-95">
                                Đăng nhập ngay
                            </button>
                        </form>
                        
                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                            <div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-gray-500">Hoặc</span></div>
                        </div>

                        <button type="button" onClick={handleGuestLogin} className="w-full py-3 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
                            <Users size={16}/> Truy cập chế độ Khách (Guest)
                        </button>
                    </>
                )}
             </div>
          </div>
        </div>
      )}

      {/* LEFT: MAIN UI */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* NEW NAVBAR */}
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between shadow-sm z-10">
          {/* Logo */}
          <div className="font-bold text-xl text-gray-800 flex items-center gap-2 tracking-tight">
             <div className="w-8 h-8 bg-gray-900 text-white flex items-center justify-center rounded-lg">F</div>
             FamilyTECH
          </div>
          
          {/* Menu Items */}
          <nav className="hidden md:flex items-center gap-8 font-medium text-gray-600 text-sm">
             <a href="#" className="flex items-center gap-2 text-blue-600 font-bold bg-blue-50 px-3 py-1.5 rounded-full">
                <BookOpen size={16}/> Khóa học
             </a>
             <a href="#" className="flex items-center gap-2 hover:text-gray-900 transition-colors">
                <FileText size={16}/> Blog
             </a>
             <a href="#" className="flex items-center gap-2 hover:text-gray-900 transition-colors">
                <MonitorPlay size={16}/> Tutorial
             </a>
          </nav>

          {/* User Account */}
          <div className="flex items-center gap-4">
             {currentUser ? (
               <div className="flex items-center gap-3 pl-4 border-l">
                  <div className="text-right hidden lg:block">
                      <p className="text-xs font-bold text-gray-800">{currentUser.username}</p>
                      <p className="text-[10px] text-gray-500 uppercase">{currentUser.type}</p>
                  </div>
                  <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold border-2 border-white shadow-sm">
                      {currentUser.username.charAt(0).toUpperCase()}
                  </div>
                  <button onClick={() => setCurrentUser(null)} className="text-gray-400 hover:text-red-500" title="Đăng xuất">
                      <Power size={18} />
                  </button>
               </div>
             ) : (
                <button onClick={() => setShowLoginModal(true)} className="text-sm font-bold text-blue-600 hover:underline">
                    Đăng nhập
                </button>
             )}
          </div>
        </header>

        {/* Hero Section */}
        <div className="bg-slate-900 text-white p-8 relative overflow-hidden">
           <div className="absolute right-0 top-0 opacity-10 pointer-events-none">
                <Activity size={200} />
           </div>
           <div className="relative z-10 max-w-2xl">
              <span className="inline-block px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full mb-3 border border-yellow-500/30">
                  ⚡ FLASH SALE
              </span>
              <h1 className="text-3xl font-bold mb-2">Hệ thống Đăng ký Tín chỉ Phân tán</h1>
              <p className="text-slate-400 text-sm mb-0 max-w-lg">
                  Demo kỹ thuật xử lý High Concurrency sử dụng Redis Atomic, Kafka Queue và Database Worker.
              </p>
           </div>
        </div>

        {/* Content - Course Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
           {courses.length === 0 && <p className="text-center text-gray-400 mt-10">Đang tải dữ liệu từ DB...</p>}

           {currentUser ? (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                 {courses.map(course => {
                   const available = redisSlots[course.id] !== undefined ? redisSlots[course.id] : '...';
                   const isProcessing = processingCourseId === course.id;
                   const isSoldOut = available <= 0;
                   
                   return (
                     <div key={course.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 flex flex-col group">
                       <div className="h-40 bg-gray-200 relative overflow-hidden">
                          <img src={course.image} alt={course.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm">
                             {course.category}
                          </div>
                          {course.id === 4 && <div className="absolute bottom-2 left-2 bg-yellow-400 text-black text-[10px] font-bold px-2 py-1 rounded shadow-sm">Target Stress Test</div>}
                       </div>
     
                       <div className="p-5 flex-1 flex flex-col">
                         <h3 className="font-bold text-lg text-gray-800 line-clamp-2 mb-1 group-hover:text-blue-600 transition-colors">{course.title}</h3>
                         <p className="text-gray-500 text-xs mb-4 flex items-center gap-1">
                            <Users size={12}/> {course.instructor}
                         </p>
                         
                         <div className="flex justify-between items-end mt-auto pt-4 border-t border-gray-50">
                            <div>
                               <div className="text-gray-400 text-xs line-through">{course.originalPrice}</div>
                               <div className="text-red-600 font-bold text-xl">{course.price}</div>
                            </div>
                            <div className="text-right">
                               <div className="text-[10px] text-gray-500 uppercase font-semibold">Slot Redis</div>
                               <div className={`text-2xl font-mono font-bold ${isSoldOut ? 'text-gray-300' : 'text-blue-600'}`}>
                                 {available}
                               </div>
                            </div>
                         </div>
     
                         <button
                           onClick={() => handleBuyCourse(course)}
                           disabled={isSoldOut || isProcessing || isStressTesting}
                           className={`mt-4 w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                             isSoldOut 
                               ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                               : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 active:scale-[0.98]'
                           }`}
                         >
                           {isProcessing ? <Zap size={16} className="animate-pulse" /> : isSoldOut ? 'HẾT HÀNG' : 'Đăng ký ngay'}
                         </button>
                       </div>
                     </div>
                   )
                 })}
               </div>
           ) : (
               // Placeholder background when blocked by auth wall (thực ra không bao giờ hiện vì Auth Wall đã che kín)
               <div className="flex items-center justify-center h-full opacity-20">
                   <div className="text-center">
                       <Lock size={64} className="mx-auto mb-4"/>
                       <p className="text-2xl font-bold">Nội dung bị khóa</p>
                   </div>
               </div>
           )}
        </div>

        {/* Notifications */}
        <div className="absolute bottom-6 left-6 z-40 flex flex-col gap-2 pointer-events-none">
           {notifications.map(n => (
             <div key={n.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-white text-sm font-medium animate-in slide-in-from-left ${
                n.type === 'success' ? 'bg-emerald-600' : 
                n.type === 'error' ? 'bg-rose-600' : 'bg-amber-500'
             }`}>
                {n.type === 'success' ? <Shield size={18} /> : 
                 n.type === 'error' ? <X size={18} /> : <AlertOctagon size={18} />}
                {n.msg}
             </div>
           ))}
        </div>
      </div>

      {/* RIGHT: MONITOR */}
      <div className="w-[420px] bg-[#0f172a] text-slate-300 flex flex-col border-l border-slate-800 shadow-2xl z-20">
        <div className="p-4 border-b border-slate-800 bg-[#1e293b]">
           <h2 className="font-mono font-bold text-emerald-400 flex items-center gap-2 text-sm mb-4">
             <Terminal size={16} /> SYSTEM_MONITOR
           </h2>
           
           <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-800 p-3 rounded border border-slate-700">
                 <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Backend Status</div>
                 <div className="text-2xl font-mono text-white flex items-center gap-2">
                    <Server size={18} className="text-blue-400" /> ONLINE
                 </div>
                 <div className="text-[10px] text-blue-400 mt-1 animate-pulse">Running on Docker</div>
              </div>
              <div className="bg-slate-800 p-3 rounded border border-slate-700">
                 <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">DB Orders</div>
                 <div className="text-2xl font-mono text-white flex items-center gap-2">
                    <Database size={18} className="text-purple-400" />
                    {dbCount}
                 </div>
              </div>
           </div>
           
           {/* Service Status Toggle */}
           <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-700 mb-4">
              <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isAuthServiceAlive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
                  <span className={`text-xs font-bold ${isAuthServiceAlive ? 'text-green-400' : 'text-red-400'}`}>
                      Auth Service
                  </span>
              </div>
              <button 
                onClick={() => {
                    setIsAuthServiceAlive(!isAuthServiceAlive);
                    addLog('SYSTEM', `Auth Service changed to: ${!isAuthServiceAlive ? 'ONLINE' : 'OFFLINE'}`, !isAuthServiceAlive ? 'success' : 'error');
                }}
                className="text-[10px] underline text-slate-500 hover:text-white"
              >
                  {isAuthServiceAlive ? 'Simulate Crash' : 'Restart'}
              </button>
           </div>

           <div className="space-y-2">
             <button 
               onClick={handleStressTest}
               disabled={isStressTesting}
               className={`w-full py-2 rounded font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                 isStressTesting 
                   ? 'bg-yellow-900/20 text-yellow-500 border-yellow-700 cursor-wait' 
                   : 'bg-yellow-600 hover:bg-yellow-500 text-slate-900 border-yellow-500'
               }`}
             >
                {isStressTesting ? (
                  <><Activity size={14} className="animate-spin"/> Stress Testing...</>
                ) : (
                  <><Zap size={14} /> Stress Test (100 req)</>
                )}
             </button>

             <button 
               onClick={handleReset}
               className="w-full bg-slate-700 hover:bg-slate-600 text-xs py-2 rounded text-slate-300 border border-slate-600 flex items-center justify-center gap-2"
             >
                <PlayCircle size={14}/> Reset Redis & DB
             </button>
           </div>
        </div>

        <div className="flex-1 p-3 font-mono text-[11px] leading-relaxed bg-[#020617] scrollbar-thin scrollbar-thumb-slate-700 overflow-y-auto">
           {logs.map(log => (
             <div key={log.id} className="mb-1 border-l-2 pl-2 border-transparent hover:border-slate-500 py-0.5">
               <span className="text-slate-600 mr-2">[{log.time}]</span>
               <span className={`font-bold inline-block w-20 ${
                  log.source === 'REDIS' ? 'text-rose-400' :
                  log.source === 'WORKER' ? 'text-blue-400' :
                  log.source === 'AUTH' ? 'text-cyan-400' :
                  log.source === 'SYSTEM' ? 'text-emerald-400' : 'text-slate-300'
               }`}>
                  {log.source}
               </span>
               <span className={log.type === 'error' ? 'text-rose-500' : log.type === 'success' ? 'text-emerald-500' : 'text-slate-400'}>
                 {log.message}
               </span>
             </div>
           ))}
           <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};

export default App;