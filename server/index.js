const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { createClient } = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. KẾT NỐI POSTGRES ---
const pgPool = new Pool({
    user: process.env.DB_USER || 'admin',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'course_db',
    password: process.env.DB_PASS || 'password123',
    port: 5432,
});

// --- 2. KẾT NỐI REDIS ---
const redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:6379`
});
redisClient.on('error', err => console.log('Redis Client Error', err));

// --- 3. HÀM ĐỒNG BỘ: DB -> REDIS (QUAN TRỌNG) ---
// Hàm này chạy khi server khởi động: Lấy tồn kho từ DB nạp vào Redis
const syncRedisWithDB = async () => {
    try {
        console.log("⏳ Dang dong bo du lieu tu DB sang Redis...");
        
        // Lấy danh sách khóa học từ DB
        const res = await pgPool.query('SELECT id, initial_slots FROM courses');
        
        if (res.rows.length === 0) {
            console.log("⚠️ DB chua co du lieu. Hay insert trong DBeaver!");
        }

        // Reset Redis và nạp dữ liệu mới
        for (let row of res.rows) {
            // Key format: "course:1", "course:2"...
            await redisClient.set(`course:${row.id}`, row.initial_slots);
            console.log(`   -> Course ${row.id}: Load ${row.initial_slots} slots`);
        }
        console.log("✅ Dong bo hoan tat!");
    } catch (e) {
        console.error("❌ Loi ket noi DB:", e);
    }
};

// --- KHỞI ĐỘNG SERVER ---
(async () => {
    await redisClient.connect();
    console.log('✅ Connected to Redis');
    
    // Gọi hàm đồng bộ dữ liệu
    await syncRedisWithDB();

    app.listen(5000, () => {
        console.log(`🚀 Server running on port 5000`);
    });
})();

// --- API ENDPOINTS ---

// 1. Mua hàng
app.post('/api/buy', async (req, res) => {
    const { courseId, userId } = req.body;
    try {
        const stock = await redisClient.decr(`course:${courseId}`);
        
        if (stock >= 0) {
            const ticketId = `TICKET-${Date.now()}`;
            // Lưu đơn hàng vào DB thật
            await pgPool.query(
                'INSERT INTO orders (ticket_id, user_id, course_id, status) VALUES ($1, $2, $3, $4)',
                [ticketId, userId, courseId, 'SUCCESS']
            );
            res.json({ success: true, ticketId, remaining: stock });
        } else {
            await redisClient.incr(`course:${courseId}`); 
            res.status(400).json({ success: false, message: "SOLD OUT" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Error" });
    }
});

// 2. Lấy trạng thái hệ thống
app.get('/api/status', async (req, res) => {
    try {
        // Lấy danh sách ID khóa học để query Redis
        const courseRes = await pgPool.query('SELECT id FROM courses');
        const slots = {};
        
        for (let row of courseRes.rows) {
            const val = await redisClient.get(`course:${row.id}`);
            slots[row.id] = parseInt(val || 0);
        }
        
        const dbRes = await pgPool.query('SELECT COUNT(*) FROM orders');
        
        res.json({ 
            redisSlots: slots, 
            dbCount: parseInt(dbRes.rows[0].count) 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Reset hệ thống (Khôi phục lại số lượng gốc từ bảng Courses)
app.post('/api/reset', async (req, res) => {
    await pgPool.query('DELETE FROM orders'); // Xóa hết đơn hàng
    await syncRedisWithDB(); // Nạp lại slot từ bảng courses gốc
    res.json({ message: "System Reset from DB Source" });
});

app.get('/api/courses', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT * FROM courses ORDER BY id ASC');
        // Map dữ liệu từ DB sang format mà Frontend cần
        const courses = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            instructor: "Giảng viên " + row.id, // Dữ liệu giả vì DB chưa có cột này (có thể thêm sau)
            price: row.price,
            originalPrice: "5.000.000đ",
            image: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=600&auto=format&fit=crop", // Ảnh mặc định
            category: "Tech",
            initialSlots: row.initial_slots
        }));
        res.json(courses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});