const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middlewares/auth');
const WordPressService = require('../services/wordpress');
const router = express.Router();

let Post, Platform, User;
try {
  Post = mongoose.model('Post');
  Platform = mongoose.model('Platform');
  User = mongoose.model('User');
} catch (error) {
  Post = require('../models/Post');
  Platform = require('../models/Platform');
  User = require('../models/User');
}

// 포스트 목록 조회
router.get('/', protect, async (req, res) => {
  try {
    const { status, platform, sort = '-createdAt' } = req.query;
    let query = { userId: req.user.id };

    if (status) {
      query.status = status;
    }
    if (platform) {
      query.platformId = platform;
    }

    const posts = await Post.find(query)
      .sort(sort)
      .populate('platformId', 'name url')
      .populate('images', 'filename originalname');

    res.json({
      success: true,
      posts: posts.map(post => ({
        id: post._id,
        title: post.title,
        content: post.content,
        status: post.status,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        platform: post.platformId,
        images: post.images,
        tags: post.tags,
        useRandomImages: post.useRandomImages,
        randomImageTags: post.randomImageTags,
        randomImageCount: post.randomImageCount,
        error: post.error,
        createdAt: post.createdAt
      }))
    });
  } catch (error) {
    console.error('포스트 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 포스트 작성 (즉시/예약)
router.post('/', protect, async (req, res) => {
  try {
    const {
      platformId,
      title,
      content,
      images,
      tags,
      scheduledAt,
      useRandomImages,
      randomImageTags,
      randomImageCount
    } = req.body;

    // 1. 플랫폼(워드프레스 계정) 확인
    const platform = await Platform.findOne({
      _id: platformId,
      user: req.user.id
    });

    if (!platform) {
      return res.status(404).json({
        success: false,
        message: '워드프레스 계정을 찾을 수 없습니다.'
      });
    }

    // 2. Level 1 사용자의 경우 일일 포스팅 횟수 체크
    if (req.user.level !== 'vip') {
      // 예약 포스팅 시도 체크
      if (scheduledAt) {
        return res.status(403).json({
          success: false,
          message: '예약 포스팅은 VIP 회원 전용 기능입니다.'
        });
      }

      // 오늘 작성한 포스트 수 확인
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayPosts = await Post.countDocuments({
        user: req.user.id,
        createdAt: { $gte: today }
      });

      if (todayPosts >= 3) {  // 하루 3회 제한
        return res.status(403).json({
          success: false,
          message: '오늘 작성 가능한 포스트 수를 초과했습니다.'
        });
      }
    }

    // 3. 포스트 생성
    const post = new Post({
      user: req.user.id,
      platformId,
      title,
      content,
      images: images || [],
      tags: tags || [],
      scheduledAt,
      status: scheduledAt ? 'scheduled' : 'pending',
      useRandomImages: useRandomImages || false,
      randomImageTags: randomImageTags || [],
      randomImageCount: randomImageCount || 1
    });

    // 4. 즉시 포스팅인 경우 워드프레스에 바로 발행
    if (!scheduledAt) {
      const wpService = new WordPressService(platform);
      const result = await wpService.createPost(title, content, 'publish', images);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: '포스트 발행에 실패했습니다: ' + result.message
        });
      }

      post.status = 'published';
      post.publishedAt = new Date();
      post.wordpressPostId = result.post.id;
    }

    await post.save();

    res.status(201).json({
      success: true,
      post: {
        id: post._id,
        title: post.title,
        status: post.status,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        platform: {
          id: platform._id,
          name: platform.name,
          url: platform.url
        }
      }
    });
  } catch (error) {
    console.error('포스트 작성 실패:', error);
    res.status(500).json({
      success: false,
      message: '포스트 작성에 실패했습니다.'
    });
  }
});

// 포스트 수정
router.put('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: '포스트를 찾을 수 없습니다'
      });
    }

    // published 상태는 수정 불가
    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: '이미 발행된 포스트는 수정할 수 없습니다'
      });
    }

    const {
      title,
      content,
      images,
      tags,
      scheduledAt,
      useRandomImages,
      randomImageTags,
      randomImageCount
    } = req.body;

    // Level 1 사용자는 예약 포스팅 불가
    if (req.user.level === 'level1' && scheduledAt) {
      return res.status(403).json({
        success: false,
        error: 'Level 1 사용자는 예약 포스팅을 사용할 수 없습니다'
      });
    }

    // 필드 업데이트
    if (title) post.title = title;
    if (content) post.content = content;
    if (images) post.images = images;
    if (tags) post.tags = tags;
    if (typeof useRandomImages === 'boolean') post.useRandomImages = useRandomImages;
    if (randomImageTags) post.randomImageTags = randomImageTags;
    if (randomImageCount) post.randomImageCount = randomImageCount;

    // 예약 시간 처리
    if (scheduledAt) {
      post.scheduledAt = new Date(scheduledAt);
      post.status = 'scheduled';
    } else {
      post.scheduledAt = null;
      post.status = 'draft';
    }

    await post.save();
    await post.populate('platformId', 'name url');
    await post.populate('images', 'filename originalname');

    res.json({
      success: true,
      post: {
        id: post._id,
        title: post.title,
        content: post.content,
        status: post.status,
        scheduledAt: post.scheduledAt,
        platform: post.platformId,
        images: post.images,
        tags: post.tags,
        useRandomImages: post.useRandomImages,
        randomImageTags: post.randomImageTags,
        randomImageCount: post.randomImageCount,
        updatedAt: post.updatedAt
      }
    });
  } catch (error) {
    console.error('포스트 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 포스트 삭제
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: '포스트를 찾을 수 없습니다'
      });
    }

    // published 상태는 삭제 불가
    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: '이미 발행된 포스트는 삭제할 수 없습니다'
      });
    }

    await post.deleteOne();

    res.json({
      success: true,
      message: '포스트가 삭제되었습니다'
    });
  } catch (error) {
    console.error('포스트 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 포스트 즉시 발행
router.post('/:id/publish', protect, async (req, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: '포스트를 찾을 수 없습니다'
      });
    }

    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: '이미 발행된 포스트입니다'
      });
    }

    // TODO: WordPress API를 사용하여 실제 포스팅 구현
    // 임시로 성공으로 처리
    const success = true;

    if (success) {
      post.status = 'published';
      post.publishedAt = new Date();
      post.error = null;
      await post.save();

      res.json({
        success: true,
        message: '포스트가 발행되었습니다',
        post: {
          id: post._id,
          status: post.status,
          publishedAt: post.publishedAt
        }
      });
    } else {
      post.status = 'failed';
      post.error = '포스팅 실패';
      await post.save();

      res.status(500).json({
        success: false,
        error: '포스트 발행에 실패했습니다'
      });
    }
  } catch (error) {
    console.error('포스트 발행 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

module.exports = router;
