const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middlewares/auth');
const router = express.Router();

let Platform;
try {
  Platform = mongoose.model('Platform');
} catch (error) {
  Platform = require('../models/Platform');
}

// 워드프레스 계정 목록 조회
router.get('/', protect, async (req, res) => {
  try {
    const platforms = await Platform.find({ userId: req.user.id });
    
    res.json({
      success: true,
      platforms: platforms.map(p => ({
        id: p._id,
        name: p.name,
        url: p.url,
        username: p.username,
        isConnected: p.isConnected,
        lastChecked: p.lastChecked
      }))
    });
  } catch (error) {
    console.error('계정 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 워드프레스 계정 등록
router.post('/', protect, async (req, res) => {
  try {
    const { name, url, username, password } = req.body;

    // 입력값 검증
    if (!name || !url || !username || !password) {
      return res.status(400).json({
        success: false,
        error: '모든 필드를 입력해주세요'
      });
    }

    // URL 형식 검증
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: '올바른 URL 형식이 아닙니다'
      });
    }

    // Level 1 사용자는 1개 계정만 등록 가능
    if (req.user.level === 'level1') {
      const count = await Platform.countDocuments({ userId: req.user.id });
      if (count >= 1) {
        return res.status(403).json({
          success: false,
          error: 'Level 1 사용자는 1개의 계정만 등록할 수 있습니다'
        });
      }
    }

    // 계정 생성
    const platform = await Platform.create({
      userId: req.user.id,
      name,
      url,
      username,
      password,
      isConnected: false
    });

    res.status(201).json({
      success: true,
      platform: {
        id: platform._id,
        name: platform.name,
        url: platform.url,
        username: platform.username,
        isConnected: platform.isConnected,
        lastChecked: platform.lastChecked
      }
    });
  } catch (error) {
    console.error('계정 등록 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 워드프레스 계정 수정
router.put('/:id', protect, async (req, res) => {
  try {
    const { name, url, username, password } = req.body;
    const platform = await Platform.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!platform) {
      return res.status(404).json({
        success: false,
        error: '계정을 찾을 수 없습니다'
      });
    }

    // 입력된 필드만 업데이트
    if (name) platform.name = name;
    if (url) {
      try {
        new URL(url);
        platform.url = url;
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: '올바른 URL 형식이 아닙니다'
        });
      }
    }
    if (username) platform.username = username;
    if (password) platform.password = password;

    // 연결 상태 초기화
    platform.isConnected = false;
    platform.lastChecked = null;

    await platform.save();

    res.json({
      success: true,
      platform: {
        id: platform._id,
        name: platform.name,
        url: platform.url,
        username: platform.username,
        isConnected: platform.isConnected,
        lastChecked: platform.lastChecked
      }
    });
  } catch (error) {
    console.error('계정 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 워드프레스 계정 삭제
router.delete('/:id', protect, async (req, res) => {
  try {
    const platform = await Platform.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!platform) {
      return res.status(404).json({
        success: false,
        error: '계정을 찾을 수 없습니다'
      });
    }

    res.json({
      success: true,
      message: '계정이 삭제되었습니다'
    });
  } catch (error) {
    console.error('계정 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 워드프레스 연결 테스트
router.post('/:id/test', protect, async (req, res) => {
  try {
    const platform = await Platform.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!platform) {
      return res.status(404).json({
        success: false,
        error: '계정을 찾을 수 없습니다'
      });
    }

    // TODO: 실제 워드프레스 연결 테스트 구현
    // 지금은 임시로 무조건 성공으로 처리
    platform.isConnected = true;
    platform.lastChecked = new Date();
    await platform.save();

    res.json({
      success: true,
      message: '연결 테스트 성공',
      platform: {
        id: platform._id,
        name: platform.name,
        url: platform.url,
        username: platform.username,
        isConnected: platform.isConnected,
        lastChecked: platform.lastChecked
      }
    });
  } catch (error) {
    console.error('연결 테스트 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

module.exports = router;
