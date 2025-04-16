const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

// Q&A 게시글 작성
router.post('/posts', auth, async (req, res) => {
    try {
        const { title, content } = req.body;
        
        // 임시로 메모리에 저장
        if (!global.qnaPosts) {
            global.qnaPosts = [];
        }
        
        const post = {
            _id: Date.now().toString(),
            title,
            content,
            author: req.user.username,
            createdAt: new Date(),
            comments: []
        };
        
        global.qnaPosts.push(post);
        
        res.status(201).json(post);
    } catch (error) {
        console.error('Error creating Q&A post:', error);
        res.status(500).json({ message: '게시글 작성에 실패했습니다.' });
    }
});

// Q&A 게시글 목록
router.get('/posts', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const posts = global.qnaPosts || [];
        
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        
        const paginatedPosts = posts.slice(startIndex, endIndex);
        
        res.json({
            posts: paginatedPosts,
            currentPage: page,
            totalPages: Math.ceil(posts.length / limit)
        });
    } catch (error) {
        console.error('Error getting Q&A posts:', error);
        res.status(500).json({ message: '게시글 목록을 불러오는데 실패했습니다.' });
    }
});

module.exports = router;
