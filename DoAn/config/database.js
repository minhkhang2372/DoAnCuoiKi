const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Kết nối database thành công!');
        
        const [tables] = await connection.query('SHOW TABLES');
        console.log('📋 Danh sách các bảng trong database:');
        tables.forEach(table => {
            console.log(`- ${Object.values(table)[0]}`);
        });
        
        connection.release();
    } catch (error) {
        console.error('❌ Lỗi kết nối database:', error);
    }
};

module.exports = { pool, testConnection }; 