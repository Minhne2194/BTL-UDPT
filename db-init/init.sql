CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    initial_slots INT,
    price VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(100),
    user_id VARCHAR(100),
    course_id INT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert dữ liệu giả lập ban đầu
INSERT INTO courses (id, title, initial_slots, price) VALUES 
(1, 'Khóa học Fullstack Next.js 14 & Spring Boot', 5, '2.500.000đ'),
(2, 'DevOps Professional: Docker - Kubernetes', 10, '1.200.000đ'),
(3, 'Kiến trúc Microservices với Kafka & Redis', 3, '999.000đ'),
(4, 'Deep Learning & Generative AI cơ bản', 50, '3.500.000đ')
ON CONFLICT DO NOTHING;