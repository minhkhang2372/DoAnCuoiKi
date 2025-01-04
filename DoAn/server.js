// server.js
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const session = require('express-session');
const methodOverride = require('method-override');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const { sendOTP, sendPasswordReset, sendNewsletterConfirmation } = require('./utils/emailService');

const app = express();
const PORT = 3000;

// API URL definition
const API_URL = 'https://apiv3.beecost.vn/search/keyword';
const SPINNER_API_URL = 'https://api.chietkhau.pro/api/v1/shopeexu/all_spinner';

// Express configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

// Path middleware
app.use((req, res, next) => {
    res.locals.path = req.path;
    next();
});

const { pool, testConnection } = require('./config/database');


testConnection();

// Session configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.use(flash());

// Middleware để làm messages có sẵn trong tất cả views
app.use((req, res, next) => {
    res.locals.success_messages = req.flash('success');
    res.locals.error_messages = req.flash('error');
    next();
});

// Make pool available to routes
app.locals.pool = pool;

// Routes
const searchRouter = require('./routes/search');
const adminRouter = require('./routes/admin');
const commentRouter = require('./routes/comment');
const businessContactRouter = require('./routes/businessContact');

app.use('/', searchRouter);
app.use('/admin', adminRouter);
app.use('/api', commentRouter(isAuthenticated));
app.use('/api/business-contact', businessContactRouter);

// Public API endpoints
app.get('/api/banners', async (req, res) => {
    try {
        const [banners] = await pool.query(
            'SELECT * FROM banners WHERE status = 1 ORDER BY position, priority DESC'
        );
        res.json(banners);
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ error: 'Failed to fetch banners' });
    }
});

const COZE_API_TOKEN = '';
const BOT_ID = '';
let conversationId = null;

// Add a variable to track the last search keyword
let lastSearchKeyword = null;

function formatProductsForChat(products, searchKey) {
    // Lọc sản phẩm hợp lệ trước
    const validProducts = products
        .filter(p => {
            if (p.common_rec_goods) {
                return p.common_rec_goods.goods_name || p.common_rec_goods.title;
            }
            return p.name;
        })
        .slice(0, 3) // Lấy tối đa 3 sản phẩm
        .map(p => {
            if (p.common_rec_goods) {
                return {
                    name: (p.common_rec_goods.goods_name || p.common_rec_goods.title)
                        .split(',')[0]
                        .substring(0, 100),
                    price: p.common_rec_goods.price_info?.price || 0,
                    marketPrice: p.common_rec_goods.price_info?.market_price || 0,
                    platform: 'Temu'
                };
            }
            return {
                name: p.name.split(',')[0].substring(0, 100),
                price: parseFloat(p.price) || 0,
                marketPrice: parseFloat(p.market_price) || parseFloat(p.price) || 0,
                platform: p.partner_name || 'Partner'
            };
        })
        .filter(p => p.price > 0 && p.marketPrice > 0);

    // Nếu không có sản phẩm, chỉ trả về message đơn giản
    if (validProducts.length === 0) {
        return {
            greeting: `Tư vấn sản phẩm "${searchKey}"`,
            products: []
        };
    }

    // Nếu có sản phẩm, trả về thông tin chi tiết
    const contextMessage = `Context: Sản phẩm cần mua "${searchKey}"
Thông tin sản phẩm:
${validProducts.map((p, index) => 
    `${index + 1}. ${p.name}
     Giá: ${p.price.toLocaleString('vi-VN')}đ
     Giá thị trường: ${p.marketPrice.toLocaleString('vi-VN')}đ
     Từ: ${p.platform}`
).join('\n')}`;

    return {
        greeting: contextMessage,
        products: validProducts
    };
}

app.post('/init-conversation', async (req, res) => {
    try {
        const response = await axios.post('https://api.coze.com/v1/conversation/create', {}, {
            headers: {
                'Authorization': `Bearer ${COZE_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        conversationId = response.data.data.id;
        res.json({ conversationId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/send-message', async (req, res) => {
    const { message, userId } = req.body;
    
    if (!conversationId) {
        return res.status(400).json({ error: 'Conversation not initialized' });
    }

    try {
        // Get product data from session
        const productData = req.session?.currentProductSearch;
        let contextMessage = message;

        // Only include product data if there's new search data and it's different from last search
        if (productData && (!lastSearchKeyword || !productData.greeting.includes(lastSearchKeyword))) {
            lastSearchKeyword = productData.greeting.match(/"([^"]+)"/)?.[1] || null;
            
            // Nếu không có sản phẩm, chỉ gửi message đơn giản
            if (productData.products.length === 0) {
                contextMessage = `Tư vấn sản phẩm "${lastSearchKeyword}"`;
            } else {
                // Nếu có sản phẩm, gửi thông tin chi tiết
                contextMessage = `
Context: Sản phẩm cần mua "${lastSearchKeyword}"
Thông tin sản phẩm:
${productData.products.map((p, index) => 
    `${index + 1}. ${p.name}
     Giá: ${p.price.toLocaleString('vi-VN')}đ
     Giá thị trường: ${p.marketPrice.toLocaleString('vi-VN')}đ
     Từ: ${p.platform}`
).join('\n')}

User message: ${message}`;
            }
        }

        await axios.post(`https://api.coze.com/v3/chat?conversation_id=${conversationId}`, {
            bot_id: BOT_ID,
            user_id: userId,
            stream: false,
            auto_save_history: true,
            additional_messages: [
                {
                    role: "user",
                    content: contextMessage,
                    content_type: "text"
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${COZE_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const historyResponse = await axios.post(
            `https://api.coze.com/v1/conversation/message/list?conversation_id=${conversationId}`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${COZE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json(historyResponse.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/check-message', async (req, res) => {
    try {
        if (!conversationId) {
            return res.status(400).json({ error: 'Conversation not initialized' });
        }

        const historyResponse = await axios.post(
            `https://api.coze.com/v1/conversation/message/list?conversation_id=${conversationId}`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${COZE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json(historyResponse.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/blogs', async (req, res) => {
    try {
        const [blogs] = await pool.query(
            'SELECT id, title, slug, SUBSTRING(content, 1, 200) as excerpt, thumbnail_url, created_at FROM blogs WHERE status = 1 ORDER BY created_at DESC LIMIT 6'
        );
        res.json(blogs);
    } catch (error) {
        console.error('Error fetching blogs:', error);
        res.status(500).json({ error: 'Failed to fetch blogs' });
    }
});

app.get('/api/blogs/:slug', async (req, res) => {
    try {
        const [blogs] = await pool.query(
            'SELECT * FROM blogs WHERE slug = ? AND status = 1',
            [req.params.slug]
        );
        if (blogs.length === 0) {
            return res.status(404).json({ error: 'Blog not found' });
        }
        res.json(blogs[0]);
    } catch (error) {
        console.error('Error fetching blog:', error);
        res.status(500).json({ error: 'Failed to fetch blog' });
    }
});

app.get('/blog/:slug', async (req, res) => {
    try {
        const [blogs] = await pool.query(
            'SELECT * FROM blogs WHERE slug = ? AND status = 1',
            [req.params.slug]
        );
        if (blogs.length === 0) {
            return res.status(404).render('404');
        }

        // Lấy thông tin user từ token (nếu có)
        let user = null;
        const token = req.cookies?.token;
        
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                user = {
                    id: decoded.id,
                    username: decoded.username,
                    role: decoded.role
                };
            } catch (err) {
                console.error('Token verification failed:', err);
            }
        }

        res.render('blog/detail', { 
            blog: blogs[0],
            user: user // Truyền thông tin user vào template
        });
    } catch (error) {
        console.error('Error fetching blog:', error);
        res.status(500).render('error', { error: 'Failed to fetch blog' });
    }
});

// Tạo thư mục uploads nếu chưa tồn tại
const uploadDirs = ['public/uploads', 'public/uploads/blogs'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Serve auth page
app.get(['/', '/login', '/register', '/verify', '/forgot-password', '/reset-password'], (req, res) => {
  res.sendFile(__dirname + '/views/auth.html');
});


app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
  
    if (!username || !email || !password) {
      return res.status(400).send('Vui lòng điền đầy đủ thông tin đăng ký!');
    }
  
    try {
      const [existingUser] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
      if (existingUser.length > 0) {
        return res.status(400).send('Username hoặc email đã tồn tại!');
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
      const otp = Math.floor(100000 + Math.random() * 900000);
  
      await pool.query('INSERT INTO users (username, email, password, role, otp, verified) VALUES (?, ?, ?, ?, ?, ?)', 
        [username, email, hashedPassword, 'user', otp, false]);
  
      req.session.registrationData = {
        email: email,
        username: username
      };
  
      await sendOTP(email, otp);
      res.send('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.');
    } catch (err) {
      console.error(err);
      res.status(500).send('Lỗi server.');
    }
});

app.post('/verify-otp', async (req, res) => {
    if (!req.session.registrationData) {
      return res.status(400).send('Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.');
    }
  
    const { otp } = req.body;
    const email = req.session.registrationData.email;
  
    try {
      const [user] = await pool.query('SELECT * FROM users WHERE email = ? AND otp = ?', [email, otp]);
      if (user.length === 0) {
        return res.status(400).send('OTP không chính xác!');
      }
  
      await pool.query('UPDATE users SET verified = TRUE, otp = NULL WHERE email = ?', [email]);
  
      req.session.registrationData = null;
      res.send('Xác nhận tài khoản thành công!');
    } catch (err) {
      console.error(err);
      res.status(500).send('Lỗi server.');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0 || !rows[0].verified) {
            return res.status(400).json({ message: 'Tài khoản không tồn tại hoặc chưa được xác nhận!' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mật khẩu không đúng!' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Set token in cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({ 
            message: 'Đăng nhập thành công!', 
            token,
            username: user.username
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server.' });
    }
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
  
    try {
        const [users] = await pool.query('SELECT id, email FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(400).send('Email không tồn tại!');
        }
        
        const user = users[0];
        const resetToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
        const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;

        await pool.query(
            'INSERT INTO reset_tokens (user_id, token) VALUES (?, ?)',
            [user.id, resetToken]
        );
  
        await sendPasswordReset(email, resetLink);
        res.send('Link đặt lại mật khẩu đã được gửi qua email.');
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi server.');
    }
});

// Middleware kiểm tra token reset password
async function validateResetToken(req, res, next) {
    const { token } = req.query;

    if (!token) {
        return res.redirect('/login?error=invalid_token');
    }

    try {
        // Kiểm tra token trong database
        const [tokenRecord] = await pool.query(
            'SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW()',
            [token]
        );

        if (tokenRecord.length === 0) {
            return res.redirect('/login?error=token_used');
        }

        // Verify JWT
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        console.error('Token validation error:', err);
        return res.redirect('/login?error=token_expired');
    }
}

// Route GET cho trang reset password
app.get('/reset-password', validateResetToken, (req, res) => {
    res.sendFile(__dirname + '/views/auth.html');
});

// Route POST để xử lý reset password
app.post('/reset-password', async (req, res) => {
    const { newPassword } = req.body;
    const { token } = req.query;
  
    try {
        if (!token) {
            return res.status(400).send('Token không hợp lệ!');
        }

        // Kiểm tra token trong database
        const [tokenRecord] = await pool.query(
            'SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW()',
            [token]
        );

        if (tokenRecord.length === 0) {
            return res.status(400).send('Link đổi mật khẩu đã được sử dụng hoặc đã hết hạn!');
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Cập nhật mật khẩu mới
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', 
            [hashedPassword, decoded.userId]
        );

        // Đánh dấu token đã sử dụng
        await pool.query(
            'UPDATE reset_tokens SET used = 1 WHERE token = ?',
            [token]
        );
  
        res.send('Đặt lại mật khẩu thành công!');
    } catch (err) {
        console.error(err);
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(400).send('Token không hợp lệ hoặc đã hết hạn!');
        }
        res.status(500).send('Lỗi server.');
    }
});

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    // Lấy token từ header Authorization hoặc cookie
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : req.cookies?.token;

    if (!token) {
        if (req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        return res.redirect('/login');
    }
}

// Profile route - Sửa lại route này
app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'profile.html'));
});

// API route để lấy thông tin user - Thêm middleware isAuthenticated vào đây
app.get('/api/user', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT username, email FROM users WHERE id = ?', 
            [req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// API to change password
app.post('/api/change-password', isAuthenticated, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    try {
        // Get user's current password
        const [user] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
        
        if (user.length === 0) {
            return res.status(404).json({ message: 'Người dùng không tồn tại' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user[0].password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

        res.json({ message: 'Đổi mật khẩu thành công' });
    } catch (err) {
        console.error('Error changing password:', err);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// Function to fetch spinner data
async function fetchSpinnerData() {
    try {
        const currentTime = Date.now();
        const response = await axios.get(`${SPINNER_API_URL}?limit=20&startTime[gte]=${currentTime}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching spinner data:', error);
        return null;
    }
}

// Route for vong quay xu
app.get('/vongquayxu', async (req, res) => {
    try {
        const spinnerData = await fetchSpinnerData();
        
        // Get user info from token if available
        let user = null;
        const token = req.cookies?.token;
        
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                user = {
                    id: decoded.id,
                    username: decoded.username,
                    role: decoded.role
                };
            } catch (err) {
                console.error('Token verification failed:', err);
            }
        }

        res.render('vongquay', { 
            data: spinnerData,
            user: user
        });
    } catch (error) {
        console.error('Error rendering vong quay page:', error);
        res.status(500).render('error', { error: 'Failed to load vong quay page' });
    }
});

// Make middleware available globally
app.locals.isAuthenticated = isAuthenticated;

// Middleware xác thực JWT
const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Access token not found' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Route đăng ký newsletter - KHÔNG yêu cầu xác thực
app.post('/api/newsletter/subscribe', async (req, res) => {
    console.log('Newsletter API called with data:', req.body);
    const { email } = req.body;
    
    if (!email) {
        console.log('Email is missing in request');
        return res.status(400).json({ message: 'Email là bắt buộc' });
    }

    try {
        // Kiểm tra email đã đăng ký chưa
        const [existingSubscriber] = await pool.query(
            'SELECT * FROM newsletter_subscribers WHERE email = ?',
            [email]
        );

        if (existingSubscriber.length > 0) {
            console.log('Email already exists:', email);
            return res.status(400).json({ 
                message: 'Email này đã đăng ký nhận tin!' 
            });
        }

        // Tạo token xác nhận
        const confirmToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '24h' });
        const confirmLink = `${process.env.BASE_URL}/api/newsletter/confirm?token=${confirmToken}`;

        // Lưu vào database trước
        await pool.query(
            'INSERT INTO newsletter_subscribers (email, confirm_token, status) VALUES (?, ?, ?)',
            [email, confirmToken, 'pending']
        );

        // Gửi email xác nhận
        try {
            await sendNewsletterConfirmation(email, confirmLink);
            console.log('Confirmation email sent successfully to:', email);
            
            res.json({ 
                message: 'Email xác nhận đã được gửi! Vui lòng kiểm tra hộp thư của bạn.' 
            });
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            
            // Xóa record đã lưu nếu gửi mail thất bại
            await pool.query(
                'DELETE FROM newsletter_subscribers WHERE email = ? AND status = ?',
                [email, 'pending']
            );
            
            throw new Error('Failed to send confirmation email');
        }
    } catch (error) {
        console.error('Newsletter subscription error:', error);
        res.status(500).json({ 
            message: 'Đã có lỗi xảy ra khi gửi email, vui lòng thử lại sau.' 
        });
    }
});

// Route xác nhận đăng ký newsletter
app.get('/api/newsletter/confirm', async (req, res) => {
    const { token } = req.query;

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Cập nhật trạng thái đăng ký
        await pool.query(
            'UPDATE newsletter_subscribers SET status = ?, confirmed_at = NOW() WHERE email = ? AND confirm_token = ?',
            ['confirmed', decoded.email, token]
        );

        res.send('Đăng ký nhận tin thành công! Bạn có thể đóng tab này.');
    } catch (error) {
        console.error('Newsletter confirmation error:', error);
        res.status(400).send('Link xác nhận không hợp lệ hoặc đã hết hạn.');
    }
});

// Routes cho các trang hỗ trợ
app.get('/huong-dan', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/support/guide.html'));
});

app.get('/lien-he', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/support/contact.html'));
});

app.get('/faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/support/faq.html'));
});

app.get('/bao-mat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/support/privacy.html'));
});

app.get('/dieu-khoan', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/support/terms.html'));
});

// Route thân thiện cho trang business contact
app.get('/lien-he-doi-tac', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/support/business-contact.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});