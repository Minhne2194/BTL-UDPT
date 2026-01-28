// Thay vì trừ state local, chúng ta gọi xuống Docker Container Server
export const buyCourse = async (courseId, userId) => {
  try {
    const response = await fetch('http://localhost:5000/api/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, userId })
    });
    return await response.json();
  } catch (error) {
    return { success: false, message: "Server Error" };
  }
};