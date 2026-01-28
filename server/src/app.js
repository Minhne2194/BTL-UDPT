const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { createClient } = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

// Kết nối DB
const pgPool = new Pool({
  connectionString: 'postgresql://admin:password123@postgres:5432/course_db'
});

// Kết nối Redis
const redisClient = createClient({ url: 'redis://redis:6379' });
redisClient.connect();

// Khởi tạo Slot vào Redis khi server chạy
const initSlots = async () => {
  const res = await pgPool.query('SELECT id, stock FROM courses');
  for (let row of res.rows) {
    await redisClient.set(`course_stock:${row.id}`, row.stock);
  }
  console.log("✅ Redis Slots Initialized");
};
initSlots();

// API: Mua khóa học (Thay thế logic processTransaction ở React)
app.post('/api/buy', async (req, res) => {
  const { courseId, userId } = req.body;

  try {
    // 1. Redis Atomic Decrement (Chịu tải cao)
    const stock = await redisClient.decr(`course_stock:${courseId}`);

    if (stock >= 0) {
      // 2. Nếu còn Slot -> Push vào Queue (Ở đây giả lập lưu DB luôn cho đơn giản)
      // Trong thực tế đoạn này sẽ đẩy vào Kafka/RabbitMQ
      const orderCode = `ORD-${Date.now()}`;
      
      // Async Write to DB (Worker giả lập)
      pgPool.query(
        'INSERT INTO orders (order_code, user_id, course_id) VALUES ($1, $2, $3)',
        [orderCode, userId, courseId]
      );

      res.json({ success: true, message: "Mua thành công", ticketId: orderCode });
    } else {
      // Rollback số lượng nếu âm (Optional logic)
      await redisClient.incr(`course_stock:${courseId}`);
      res.status(400).json({ success: false, message: "Hết slot!" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Lấy thông tin realtime cho System Monitor
app.get('/api/status', async (req, res) => {
    // Trả về số lượng hàng đợi, redis stock, v.v.
});

app.listen(5000, () => console.log('Server running on port 5000'));