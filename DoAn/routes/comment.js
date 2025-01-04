const express = require('express');

// Export một function thay vì router trực tiếp
module.exports = function(isAuthenticated) {
    const router = express.Router();

    // Get comments for blog
    router.get('/blogs/:blogId/comments', async (req, res) => {
        const pool = req.app.locals.pool;
        try {
            const [comments] = await pool.query(
                `SELECT 
                    comments.*, 
                    users.username,
                    (SELECT COUNT(*) FROM comment_likes WHERE comment_id = comments.id) as likes_count,
                    (SELECT COUNT(*) FROM comment_replies WHERE comment_id = comments.id) as replies_count
                 FROM comments 
                 JOIN users ON comments.user_id = users.id 
                 WHERE blog_id = ? 
                 ORDER BY comments.created_at DESC`,
                [req.params.blogId]
            );
            res.json(comments);
        } catch (error) {
            console.error('Error fetching comments:', error);
            res.status(500).json({ error: 'Failed to fetch comments' });
        }
    });

    // Add comment to blog
    router.post('/blogs/:blogId/comments', isAuthenticated, async (req, res) => {
        const pool = req.app.locals.pool;
        try {
            const { content } = req.body;
            const blogId = req.params.blogId;
            const userId = req.user.id;

            await pool.query(
                'INSERT INTO comments (blog_id, user_id, content) VALUES (?, ?, ?)',
                [blogId, userId, content]
            );
            res.status(201).json({ message: 'Comment added successfully' });
        } catch (error) {
            console.error('Error adding comment:', error);
            res.status(500).json({ error: 'Failed to add comment' });
        }
    });

    // Get comment replies
    router.get('/comments/:commentId/replies', async (req, res) => {
        const pool = req.app.locals.pool;
        try {
            const [replies] = await pool.query(
                `SELECT comment_replies.*, users.username 
                 FROM comment_replies 
                 JOIN users ON comment_replies.user_id = users.id 
                 WHERE comment_id = ? 
                 ORDER BY comment_replies.created_at ASC`,
                [req.params.commentId]
            );
            res.json(replies);
        } catch (error) {
            console.error('Error fetching replies:', error);
            res.status(500).json({ error: 'Failed to fetch replies' });
        }
    });

    // Add reply to comment
    router.post('/comments/:commentId/replies', isAuthenticated, async (req, res) => {
        const pool = req.app.locals.pool;
        try {
            const { content } = req.body;
            const commentId = req.params.commentId;
            const userId = req.user.id;

            await pool.query(
                'INSERT INTO comment_replies (comment_id, user_id, content) VALUES (?, ?, ?)',
                [commentId, userId, content]
            );
            res.status(201).json({ message: 'Reply added successfully' });
        } catch (error) {
            console.error('Error adding reply:', error);
            res.status(500).json({ error: 'Failed to add reply' });
        }
    });

    // Toggle like on comment
    router.post('/comments/:commentId/like', isAuthenticated, async (req, res) => {
        const pool = req.app.locals.pool;
        try {
            const commentId = req.params.commentId;
            const userId = req.user.id;

            // Check if user already liked the comment
            const [existingLike] = await pool.query(
                'SELECT * FROM comment_likes WHERE comment_id = ? AND user_id = ?',
                [commentId, userId]
            );

            if (existingLike.length > 0) {
                // Unlike
                await pool.query(
                    'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?',
                    [commentId, userId]
                );
                res.json({ liked: false });
            } else {
                // Like
                await pool.query(
                    'INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)',
                    [commentId, userId]
                );
                res.json({ liked: true });
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            res.status(500).json({ error: 'Failed to toggle like' });
        }
    });

    // Get comment likes
    router.get('/comments/:commentId/likes', async (req, res) => {
        const pool = req.app.locals.pool;
        try {
            const [likes] = await pool.query(
                'SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?',
                [req.params.commentId]
            );
            
            // If user is authenticated, check if they liked the comment
            let userLiked = false;
            if (req.user) {
                const [userLike] = await pool.query(
                    'SELECT * FROM comment_likes WHERE comment_id = ? AND user_id = ?',
                    [req.params.commentId, req.user.id]
                );
                userLiked = userLike.length > 0;
            }

            res.json({ 
                count: likes[0].count,
                userLiked
            });
        } catch (error) {
            console.error('Error fetching likes:', error);
            res.status(500).json({ error: 'Failed to fetch likes' });
        }
    });

    return router;
}; 