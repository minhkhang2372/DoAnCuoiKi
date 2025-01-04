const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Middleware to check admin authentication
const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// Multer configuration
const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            const uploadDir = 'public/uploads/blogs';
            if (!fs.existsSync(uploadDir)){
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    })
});

// Login routes
router.get('/login', (req, res) => {
    res.render('admin/login');
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const pool = req.app.locals.pool;
        const [users] = await pool.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (users.length && await bcrypt.compare(password, users[0].password)) {
            req.session.user = {
                id: users[0].id,
                username: users[0].username,
                role: users[0].role
            };
            res.redirect('/admin/dashboard');
        } else {
            res.render('admin/login', { error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('admin/login', { error: 'Server error' });
    }
});

// Dashboard route
router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [products] = await pool.query(`
            SELECT p.*, pa.name as partner_name 
            FROM products p 
            LEFT JOIN partners pa ON p.partner_id = pa.id 
            ORDER BY p.created_at DESC 
            LIMIT 10
        `);
        res.render('admin/dashboard', { 
            products,
            user: req.session.user
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('admin/dashboard', { 
            error: 'Failed to load dashboard',
            user: req.session.user
        });
    }
});

// Products routes
router.get('/products', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [products] = await pool.query(`
            SELECT p.*, pa.name as partner_name 
            FROM products p 
            LEFT JOIN partners pa ON p.partner_id = pa.id 
            ORDER BY p.created_at DESC
        `);
        res.render('admin/products/index', { 
            products,
            user: req.session.user
        });
    } catch (error) {
        console.error('Products error:', error);
        res.render('admin/products/index', { 
            error: 'Failed to load products', 
            products: [],
            user: req.session.user
        });
    }
});


// Partners routes
router.get('/partners', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [partners] = await pool.query('SELECT * FROM partners ORDER BY created_at DESC');
        res.render('admin/partners/index', { 
            partners,
            user: req.session.user
        });
    } catch (error) {
        console.error('Partners error:', error);
        res.render('admin/partners/index', { 
            error: 'Failed to load partners', 
            partners: [],
            user: req.session.user
        });
    }
});

router.get('/partners/new', requireAdmin, async (req, res) => {
    res.render('admin/partners/form', { 
        partner: {}, 
        mode: 'create',
        user: req.session.user
    });
});

router.get('/partners/:id/edit', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [partners] = await pool.query('SELECT * FROM partners WHERE id = ?', [req.params.id]);
        if (partners.length === 0) {
            return res.redirect('/admin/partners');
        }
        res.render('admin/partners/form', { 
            partner: partners[0], 
            mode: 'edit',
            user: req.session.user
        });
    } catch (error) {
        console.error('Edit partner error:', error);
        res.redirect('/admin/partners');
    }
});

// API endpoints for products
router.post('/products', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { partner_id, name, description, price, market_price, image_url, product_url, priority } = req.body;
        await pool.query(
            'INSERT INTO products (partner_id, name, description, price, market_price, image_url, product_url, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [partner_id, name, description, price, market_price, image_url, product_url, priority]
        );
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Create product error:', error);
        res.redirect('/admin/products/new');
    }
});

router.put('/products/:id', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { partner_id, name, description, price, market_price, image_url, product_url, priority, status } = req.body;
        await pool.query(
            'UPDATE products SET partner_id = ?, name = ?, description = ?, price = ?, market_price = ?, image_url = ?, product_url = ?, priority = ?, status = ? WHERE id = ?',
            [partner_id, name, description, price, market_price, image_url, product_url, priority, status, req.params.id]
        );
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Update product error:', error);
        res.redirect(`/admin/products/${req.params.id}/edit`);
    }
});

router.delete('/products/:id', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

router.get('/products/new', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [partners] = await pool.query('SELECT * FROM partners WHERE status = true');
        res.render('admin/products/form', { 
            product: {}, 
            partners, 
            mode: 'create',
            user: req.session.user
        });
    } catch (error) {
        console.error('New product error:', error);
        res.redirect('/admin/products');
    }
});


router.get('/products/:id/edit', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [products] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        const [partners] = await pool.query('SELECT * FROM partners WHERE status = true');
        if (products.length === 0) {
            return res.redirect('/admin/products');
        }
        res.render('admin/products/form', { 
            product: products[0], 
            partners, 
            mode: 'edit',
            user: req.session.user
        });
    } catch (error) {
        console.error('Edit product error:', error);
        res.redirect('/admin/products');
    }
});

// API endpoints for partners
router.post('/partners', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { name, website } = req.body;
        await pool.query(
            'INSERT INTO partners (name, website) VALUES (?, ?)',
            [name, website]
        );
        res.redirect('/admin/partners');
    } catch (error) {
        console.error('Create partner error:', error);
        res.redirect('/admin/partners/new');
    }
});

router.put('/partners/:id', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { name, website, status } = req.body;
        await pool.query(
            'UPDATE partners SET name = ?, website = ?, status = ? WHERE id = ?',
            [name, website, status, req.params.id]
        );
        res.redirect('/admin/partners');
    } catch (error) {
        console.error('Update partner error:', error);
        res.redirect(`/admin/partners/${req.params.id}/edit`);
    }
});

router.delete('/partners/:id', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        await pool.query('DELETE FROM partners WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete partner error:', error);
        res.status(500).json({ error: 'Failed to delete partner' });
    }
});

// Banner routes
router.get('/banners', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [banners] = await pool.query('SELECT * FROM banners ORDER BY position, priority DESC');
        res.render('admin/banners/index', { 
            banners,
            user: req.session.user
        });
    } catch (error) {
        console.error('Banners error:', error);
        res.render('admin/banners/index', { 
            error: 'Failed to load banners', 
            banners: [],
            user: req.session.user
        });
    }
});

router.get('/banners/new', requireAdmin, (req, res) => {
    res.render('admin/banners/form', { 
        banner: {}, 
        mode: 'create',
        user: req.session.user
    });
});

router.post('/banners', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { title, description, image_url, link, position, priority } = req.body;
        const finalImageUrl = req.file ? 
            `/uploads/banners/${req.file.filename}` : 
            image_url;

        await pool.query(
            'INSERT INTO banners (title, description, image_url, link, position, priority) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, finalImageUrl, link, position, priority]
        );
        res.redirect('/admin/banners');
    } catch (error) {
        console.error('Create banner error:', error);
        res.redirect('/admin/banners/new');
    }
});

router.get('/banners/:id/edit', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [banners] = await pool.query('SELECT * FROM banners WHERE id = ?', [req.params.id]);
        if (banners.length === 0) {
            return res.redirect('/admin/banners');
        }
        res.render('admin/banners/form', { 
            banner: banners[0], 
            mode: 'edit',
            user: req.session.user
        });
    } catch (error) {
        console.error('Edit banner error:', error);
        res.redirect('/admin/banners');
    }
});

router.put('/banners/:id', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { title, description, image_url, link, position, priority, status } = req.body;
        const finalImageUrl = req.file ? 
            `/uploads/banners/${req.file.filename}` : 
            image_url;

        await pool.query(
            'UPDATE banners SET title = ?, description = ?, image_url = ?, link = ?, position = ?, priority = ?, status = ? WHERE id = ?',
            [title, description, finalImageUrl, link, position, priority, status, req.params.id]
        );
        res.redirect('/admin/banners');
    } catch (error) {
        console.error('Update banner error:', error);
        res.redirect(`/admin/banners/${req.params.id}/edit`);
    }
});

router.delete('/banners/:id', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        await pool.query('DELETE FROM banners WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete banner error:', error);
        res.status(500).json({ error: 'Failed to delete banner' });
    }
});

router.get('/logout', requireAdmin, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/admin/login');
    });
});

// Blog routes
router.get('/blogs', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [blogs] = await pool.query('SELECT * FROM blogs ORDER BY created_at DESC');
        res.render('admin/blogs/index', { 
            blogs,
            user: req.session.user
        });
    } catch (error) {
        console.error('Blogs error:', error);
        res.render('admin/blogs/index', { 
            error: 'Failed to load blogs', 
            blogs: [],
            user: req.session.user
        });
    }
});

router.get('/blogs/new', requireAdmin, (req, res) => {
    res.render('admin/blogs/form', { 
        blog: {}, 
        mode: 'create',
        user: req.session.user
    });
});

router.post('/blogs', requireAdmin, upload.single('thumbnail'), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { title, content } = req.body;
        
        const slug = title.toLowerCase()
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        const thumbnailUrl = req.file ? 
            `/uploads/blogs/${req.file.filename}` : 
            null;

        await pool.query(
            'INSERT INTO blogs (title, slug, content, thumbnail_url, status) VALUES (?, ?, ?, ?, ?)',
            [title, slug, content, thumbnailUrl, 1]
        );
        
        req.flash('success', 'Blog post created successfully');
        res.redirect('/admin/blogs');
    } catch (error) {
        console.error('Create blog error:', error);
        req.flash('error', 'Failed to create blog post');
        res.redirect('/admin/blogs/new');
    }
});

router.get('/blogs/:id/edit', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const [blogs] = await pool.query('SELECT * FROM blogs WHERE id = ?', [req.params.id]);
        if (blogs.length === 0) {
            return res.redirect('/admin/blogs');
        }
        res.render('admin/blogs/form', { 
            blog: blogs[0], 
            mode: 'edit',
            user: req.session.user
        });
    } catch (error) {
        console.error('Edit blog error:', error);
        res.redirect('/admin/blogs');
    }
});

router.put('/blogs/:id', requireAdmin, upload.single('thumbnail'), async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const { title, content, status, existing_thumbnail } = req.body;
        
        const slug = title.toLowerCase()
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        let thumbnailUrl = existing_thumbnail;
        if (req.file) {
            thumbnailUrl = `/uploads/blogs/${req.file.filename}`;
            if (existing_thumbnail) {
                const oldPath = path.join(__dirname, '../public', existing_thumbnail);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
        }

        await pool.query(
            'UPDATE blogs SET title = ?, slug = ?, content = ?, thumbnail_url = ?, status = ? WHERE id = ?',
            [title, slug, content, thumbnailUrl, status || 1, req.params.id]
        );

        req.flash('success', 'Blog post updated successfully');
        res.redirect('/admin/blogs');
    } catch (error) {
        console.error('Update blog error:', error);
        req.flash('error', 'Failed to update blog post');
        res.redirect(`/admin/blogs/${req.params.id}/edit`);
    }
});

router.delete('/blogs/:id', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        await pool.query('DELETE FROM blogs WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete blog error:', error);
        res.status(500).json({ error: 'Failed to delete blog' });
    }
});

module.exports = router; 