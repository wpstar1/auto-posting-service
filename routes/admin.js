const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middlewares/auth');

// 모델 로드
let User;
let SystemConfig;
let Notice;
let Activity;
let Post;
let Faq; // FAQ 모델 추가

try {
  User = mongoose.model('User');
  SystemConfig = mongoose.model('SystemConfig');
  Notice = mongoose.model('Notice');
  Activity = mongoose.model('Activity');
  Post = mongoose.model('Post');
  Faq = mongoose.model('Faq'); // FAQ 모델 추가
} catch (error) {
  User = require('../models/User');
  SystemConfig = require('../models/SystemConfig');
  Notice = require('../models/Notice') || mongoose.model('Notice', new mongoose.Schema({
    title: String,
    content: String,
    status: String,
    important: Boolean,
    createdAt: Date,
    updatedAt: Date
  }));
  Activity = require('../models/Activity') || mongoose.model('Activity', new mongoose.Schema({
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    action: String,
    details: String,
    timestamp: Date
  }));
  Post = require('../models/Post');
  Faq = require('../models/Faq'); // FAQ 모델 추가
}

// 관리자 확인 미들웨어
const adminCheck = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
};

// 관리자 권한 확인 엔드포인트
router.get('/check-admin', protect, async (req, res) => {
  try {
    const isAdmin = req.user && req.user.role === 'admin';
    
    res.json({
      success: true,
      isAdmin
    });
  } catch (error) {
    console.error('관리자 권한 확인 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 관리자 계정 생성 (초기 설정용)
router.post('/initialize', async (req, res) => {
  try {
    // 이미 관리자 계정이 있는지 확인
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (adminExists) {
      return res.status(400).json({
        success: false,
        message: '관리자 계정이 이미 존재합니다.'
      });
    }
    
    // 관리자 계정 생성
    const admin = await User.create({
      username: 'admin',
      email: 'admin@autoposting.com',
      password: '@wotj0421',
      role: 'admin',
      level: 'vip',
      membership: 'vip'
    });
    
    // 시스템 설정 초기화
    let config = await SystemConfig.findOne();
    if (!config) {
      config = await SystemConfig.create({
        system: {
          version: '1.0.0',
          maintenanceMode: false
        }
      });
    }
    
    res.status(201).json({
      success: true,
      message: '관리자 계정이 생성되었습니다.',
      config
    });
  } catch (error) {
    console.error('관리자 계정 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 시스템 정보 가져오기
router.get('/system', protect, adminCheck, async (req, res) => {
  try {
    const config = await SystemConfig.findOne();
    
    res.json({
      success: true,
      version: config?.system?.version || '1.0.0',
      maintenanceMode: config?.system?.maintenanceMode || false
    });
  } catch (error) {
    console.error('시스템 정보 로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 유지보수 모드 전환
router.post('/system/maintenance', protect, adminCheck, async (req, res) => {
  try {
    const { toggle } = req.body;
    
    let config = await SystemConfig.findOne();
    if (!config) {
      config = await SystemConfig.create({
        system: {
          version: '1.0.0',
          maintenanceMode: false
        }
      });
    }
    
    if (toggle) {
      config.system.maintenanceMode = !config.system.maintenanceMode;
      await config.save();
    }
    
    res.json({
      success: true,
      maintenanceMode: config.system.maintenanceMode
    });
  } catch (error) {
    console.error('유지보수 모드 전환 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 사용자 통계
router.get('/users/stats', protect, adminCheck, async (req, res) => {
  try {
    const total = await User.countDocuments();
    const active = await User.countDocuments({ lastLogin: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });
    const vip = await User.countDocuments({ membership: 'vip' });
    
    res.json({
      success: true,
      total,
      active,
      vip
    });
  } catch (error) {
    console.error('사용자 통계 로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 포스팅 통계
router.get('/posts/stats', protect, adminCheck, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const todayPosts = await Post.countDocuments({ createdAt: { $gte: today } });
    const weeklyPosts = await Post.countDocuments({ createdAt: { $gte: weekStart } });
    const totalPosts = await Post.countDocuments();
    
    res.json({
      success: true,
      today: todayPosts,
      weekly: weeklyPosts,
      total: totalPosts
    });
  } catch (error) {
    console.error('포스팅 통계 로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 최근 활동 목록
router.get('/activities', protect, adminCheck, async (req, res) => {
  try {
    const activities = await Activity.find()
      .sort({ timestamp: -1 })
      .limit(10);
    
    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('활동 로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 활동 조회
router.get('/activities', protect, async (req, res) => {
  try {
    const activities = await Activity.find({})
      .populate('user', 'username')
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('활동 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// VIP 신청 목록 조회
router.get('/vip-requests', protect, adminCheck, async (req, res) => {
  try {
    const requests = await User.find({ membershipStatus: 'pending' })
      .select('username email vipRequestDate vipRequestMessage membershipDuration');
    
    res.json({
      success: true,
      requests
    });
  } catch (error) {
    console.error('VIP 신청 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// VIP 신청 승인/거절
router.post('/vip-requests/:userId', protect, adminCheck, async (req, res) => {
  try {
    const { action, duration } = req.body;
    
    // 해당 유저 찾기
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }
    
    // 승인 처리
    if (action === 'approve') {
      const today = new Date();
      const expireDate = new Date();
      
      // 기간에 따라 만료일 설정
      let months = 1; // 기본값 1개월
      
      if (duration === '1month' || duration === '1') {
        months = 1;
      } else if (duration === '3months' || duration === '3') {
        months = 3;
      } else if (duration === '6months' || duration === '6') {
        months = 6;
      } else if (duration === '12months' || duration === '12') {
        months = 12;
      }
      
      expireDate.setMonth(expireDate.getMonth() + months);
      
      // 사용자 정보 업데이트
      user.level = 'vip';
      user.membershipStatus = 'active';
      user.membershipExpires = expireDate;
      user.membershipStartDate = today;
      user.membershipDuration = duration;
      
      await user.save();
      
      // 활동 로그 기록
      if (Activity) {
        await Activity.create({
          user: req.user._id,
          action: 'vip_approved',
          details: `${user.username} 사용자를 VIP로 승인 (기간: ${duration})`,
          timestamp: new Date()
        });
      }
      
      res.json({
        success: true,
        message: `사용자 ${user.username}의 VIP 신청이 승인되었습니다.`,
        expireDate
      });
    } 
    // 거절 처리
    else if (action === 'reject') {
      user.membershipStatus = 'none';
      await user.save();
      
      // 활동 로그 기록
      if (Activity) {
        await Activity.create({
          user: req.user._id,
          action: 'vip_rejected',
          details: `${user.username} 사용자의 VIP 신청이 거절됨`,
          timestamp: new Date()
        });
      }
      
      res.json({
        success: true,
        message: `사용자 ${user.username}의 VIP 신청이 거절되었습니다.`
      });
    } else {
      return res.status(400).json({
        success: false,
        message: '유효하지 않은 액션입니다.'
      });
    }
  } catch (error) {
    console.error('VIP 신청 처리 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 모든 회원 목록 조회
router.get('/users', protect, adminCheck, async (req, res) => {
  try {
    const { search, sort = 'createdAt', order = -1, page = 1, limit = 10 } = req.query;
    
    let query = {};
    if (search) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    const total = await User.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('-password')
      .sort({ [sort]: parseInt(order) })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('회원 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 공지사항 목록 조회
router.get('/notices', protect, adminCheck, async (req, res) => {
  try {
    const notices = await Notice.find()
      .sort({ important: -1, createdAt: -1 });
    
    res.json({
      success: true,
      notices
    });
  } catch (error) {
    console.error('공지사항 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 공지사항 생성
router.post('/notices', protect, adminCheck, async (req, res) => {
  try {
    const { title, content, important, status } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '제목과 내용은 필수 항목입니다.'
      });
    }
    
    const notice = new Notice({
      title,
      content,
      important: important || false,
      status: status || 'published',
      author: req.user._id
    });
    
    await notice.save();
    
    // 활동 로그 기록
    await Activity.create({
      user: req.user._id,
      action: '공지사항 생성',
      details: `제목: ${title}`
    });
    
    res.status(201).json({
      success: true,
      notice
    });
  } catch (error) {
    console.error('공지사항 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 공지사항 수정
router.put('/notices/:id', protect, adminCheck, async (req, res) => {
  try {
    const { title, content, important, status } = req.body;
    
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: '공지사항을 찾을 수 없습니다.'
      });
    }
    
    notice.title = title || notice.title;
    notice.content = content || notice.content;
    notice.important = important !== undefined ? important : notice.important;
    notice.status = status || notice.status;
    
    await notice.save();
    
    res.json({
      success: true,
      notice
    });
  } catch (error) {
    console.error('공지사항 수정 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 공지사항 삭제
router.delete('/notices/:id', protect, adminCheck, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: '공지사항을 찾을 수 없습니다.'
      });
    }
    
    await notice.deleteOne();
    
    res.json({
      success: true,
      message: '공지사항이 삭제되었습니다.'
    });
  } catch (error) {
    console.error('공지사항 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// VIP 회원 관리 (기간 수정, 상태 변경)
router.put('/users/:userId/membership', protect, adminCheck, async (req, res) => {
  try {
    const { action, duration } = req.body;
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }
    
    // 액션에 따른 처리
    if (action === 'extend') {
      // 기간 연장
      const currentExpiry = user.membershipExpires || new Date();
      const newExpiry = new Date(currentExpiry);
      
      let months = 1; // 기본값 1개월
      
      if (duration === '1month' || duration === '1') {
        months = 1;
      } else if (duration === '3months' || duration === '3') {
        months = 3;
      } else if (duration === '6months' || duration === '6') {
        months = 6;
      } else if (duration === '12months' || duration === '12') {
        months = 12;
      }
      
      newExpiry.setMonth(newExpiry.getMonth() + months);
      
      user.membershipExpires = newExpiry;
      user.membershipStatus = 'active';
      user.level = 'vip';
      
    } else if (action === 'cancel') {
      // VIP 취소
      user.membershipStatus = 'expired';
      user.level = 'level1';
      
    } else if (action === 'upgrade') {
      // 일반 회원을 VIP로 즉시 업그레이드
      const today = new Date();
      const expireDate = new Date();
      
      let months = 1; // 기본값 1개월
      
      if (duration === '1month' || duration === '1') {
        months = 1;
      } else if (duration === '3months' || duration === '3') {
        months = 3;
      } else if (duration === '6months' || duration === '6') {
        months = 6;
      } else if (duration === '12months' || duration === '12') {
        months = 12;
      }
      
      expireDate.setMonth(expireDate.getMonth() + months);
      
      user.level = 'vip';
      user.membershipStatus = 'active';
      user.membershipExpires = expireDate;
      user.membershipDuration = duration;
      user.membershipStartDate = today;
    }
    
    await user.save();
    
    // 활동 로그
    if (Activity) {
      await Activity.create({
        user: req.user._id,
        action: `membership_${action}`,
        details: `${user.username} 사용자의 멤버십을 ${action} 처리함`,
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      message: `사용자 ${user.username}의 멤버십이 업데이트되었습니다.`,
      user: {
        id: user._id,
        username: user.username,
        level: user.level,
        membershipStatus: user.membershipStatus,
        membershipExpires: user.membershipExpires
      }
    });
  } catch (error) {
    console.error('멤버십 관리 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 사용자 목록 조회
router.get('/users', protect, adminCheck, async (req, res) => {
  try {
    const { role, membershipStatus } = req.query;
    
    let query = {};
    
    if (role && role !== 'all') {
      query.role = role;
    }
    
    if (membershipStatus && membershipStatus !== 'all') {
      query.membershipStatus = membershipStatus;
    }
    
    const users = await User.find(query)
      .select('username email role createdAt membershipStatus')
      .sort({ createdAt: -1 });
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '사용자 목록 조회',
      details: `필터: ${JSON.stringify(req.query)}`
    });
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('사용자 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '사용자 목록을 불러오는 중 오류가 발생했습니다'
    });
  }
});

// 사용자 상세 정보 조회
router.get('/users/:userId', protect, adminCheck, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '사용자 정보 조회',
      details: `사용자: ${user.username} (${user._id})`
    });
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '사용자 정보를 불러오는 중 오류가 발생했습니다'
    });
  }
});

// 사용자 삭제
router.delete('/users/:userId', protect, adminCheck, async (req, res) => {
  try {
    // 자기 자신은 삭제할 수 없음
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: '자기 자신을 삭제할 수 없습니다'
      });
    }
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }
    
    // 관리자는 삭제할 수 없음 (다른 관리자도)
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 계정은 삭제할 수 없습니다'
      });
    }
    
    // 활동 로그 기록
    await Activity.create({
      user: req.user._id,
      action: '사용자 삭제',
      details: `사용자: ${user.username} (${user._id})`
    });
    
    await User.deleteOne({ _id: req.params.userId });
    
    res.json({
      success: true,
      message: '사용자가 삭제되었습니다'
    });
  } catch (error) {
    console.error('사용자 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '사용자 삭제 중 오류가 발생했습니다'
    });
  }
});

// 사용자 멤버십 정보 업데이트
router.put('/users/:userId/membership', protect, adminCheck, async (req, res) => {
  try {
    const { membershipStatus, membershipDuration } = req.body;
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }
    
    // 멤버십 상태 업데이트
    user.membershipStatus = membershipStatus;
    
    // 만약 VIP로 승인된 경우
    if (membershipStatus === 'active') {
      const duration = parseInt(membershipDuration) || 1; // 기본값 1개월
      user.membershipDuration = duration;
      user.membershipStartDate = new Date();
      
      // 만료일 계산 (현재 날짜 + 멤버십 기간)
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + duration);
      user.membershipExpires = expiryDate;
    } else if (membershipStatus === 'none' || membershipStatus === 'expired') {
      // 멤버십 취소 또는 만료 처리
      user.membershipExpires = null;
    }
    
    await user.save();
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '멤버십 정보 업데이트',
      details: `사용자: ${user.username}, 상태: ${membershipStatus}, 기간: ${membershipDuration}개월`
    });
    
    res.json({
      success: true,
      message: '멤버십 정보가 업데이트되었습니다',
      user: {
        _id: user._id,
        username: user.username,
        membershipStatus: user.membershipStatus,
        membershipExpires: user.membershipExpires,
        membershipDuration: user.membershipDuration
      }
    });
  } catch (error) {
    console.error('멤버십 정보 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '멤버십 정보 업데이트 중 오류가 발생했습니다'
    });
  }
});

// 시스템 설정 조회
router.get('/system-config', protect, adminCheck, async (req, res) => {
  try {
    let config = await SystemConfig.findOne();
    
    if (!config) {
      // 기본 설정 생성
      config = await SystemConfig.create({
        level1: {
          dailyPostLimit: 3,
          maxPlatforms: 1,
          features: ['instantPosting']
        },
        vip: {
          features: ['instantPosting', 'scheduledPosting', 'multiPlatform', 'imageLibrary', 'advancedSettings']
        },
        system: {
          maintenanceMode: false,
          version: '1.0.0'
        }
      });
    }
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '시스템 설정 조회'
    });
    
    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('시스템 설정 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '시스템 설정을 불러오는 중 오류가 발생했습니다'
    });
  }
});

// 시스템 설정 업데이트
router.post('/system-config', protect, adminCheck, async (req, res) => {
  try {
    const { level1, vip } = req.body;
    
    let config = await SystemConfig.findOne();
    
    if (!config) {
      // 기본 설정 생성
      config = new SystemConfig({
        level1: {
          dailyPostLimit: 3,
          maxPlatforms: 1,
          features: ['instantPosting']
        },
        vip: {
          features: ['instantPosting', 'scheduledPosting', 'multiPlatform', 'imageLibrary', 'advancedSettings']
        },
        system: {
          maintenanceMode: false,
          version: '1.0.0'
        }
      });
    }
    
    // 설정 업데이트
    if (level1) {
      config.level1 = level1;
    }
    
    if (vip) {
      config.vip = vip;
    }
    
    await config.save();
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '시스템 설정 업데이트',
      details: JSON.stringify(req.body)
    });
    
    res.json({
      success: true,
      message: '시스템 설정이 업데이트되었습니다',
      config
    });
  } catch (error) {
    console.error('시스템 설정 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '시스템 설정 업데이트 중 오류가 발생했습니다'
    });
  }
});

// 유지보수 모드 전환
router.post('/toggle-maintenance', protect, adminCheck, async (req, res) => {
  try {
    let config = await SystemConfig.findOne();
    
    if (!config) {
      // 기본 설정 생성
      config = new SystemConfig({
        level1: {
          dailyPostLimit: 3,
          maxPlatforms: 1,
          features: ['instantPosting']
        },
        vip: {
          features: ['instantPosting', 'scheduledPosting', 'multiPlatform', 'imageLibrary', 'advancedSettings']
        },
        system: {
          maintenanceMode: false,
          version: '1.0.0'
        }
      });
    }
    
    // 유지보수 모드 전환
    config.system.maintenanceMode = !config.system.maintenanceMode;
    
    await config.save();
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '유지보수 모드 전환',
      details: `상태: ${config.system.maintenanceMode ? '활성화' : '비활성화'}`
    });
    
    res.json({
      success: true,
      message: `유지보수 모드가 ${config.system.maintenanceMode ? '활성화' : '비활성화'}되었습니다`,
      maintenanceMode: config.system.maintenanceMode
    });
  } catch (error) {
    console.error('유지보수 모드 전환 오류:', error);
    res.status(500).json({
      success: false,
      message: '유지보수 모드 전환 중 오류가 발생했습니다'
    });
  }
});

// 문의 목록 조회
router.get('/inquiries', protect, adminCheck, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Inquiry 모델이 있는지 확인
    let Inquiry;
    try {
      Inquiry = mongoose.model('Inquiry');
    } catch (error) {
      // Inquiry 모델이 없을 경우 임시 모델 생성
      Inquiry = mongoose.model('Inquiry', new mongoose.Schema({
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        title: String,
        content: String,
        status: { type: String, enum: ['pending', 'inProgress', 'completed'], default: 'pending' },
        createdAt: { type: Date, default: Date.now },
        updatedAt: Date,
        replies: [{
          content: String,
          createdAt: { type: Date, default: Date.now },
          admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        }]
      }));
    }
    
    const inquiries = await Inquiry.find(query)
      .populate('user', 'username')
      .sort({ createdAt: -1 });
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '문의 목록 조회',
      details: `필터: ${JSON.stringify(req.query)}`
    });
    
    res.json({
      success: true,
      inquiries
    });
  } catch (error) {
    console.error('문의 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '문의 목록을 불러오는 중 오류가 발생했습니다'
    });
  }
});

// 문의 상세 정보 조회
router.get('/inquiries/:inquiryId', protect, adminCheck, async (req, res) => {
  try {
    // Inquiry 모델이 있는지 확인
    let Inquiry;
    try {
      Inquiry = mongoose.model('Inquiry');
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '문의 모델을 찾을 수 없습니다'
      });
    }
    
    const inquiry = await Inquiry.findById(req.params.inquiryId)
      .populate('user', 'username email')
      .populate('replies.admin', 'username');
    
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: '문의를 찾을 수 없습니다'
      });
    }
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '문의 상세 조회',
      details: `문의 ID: ${inquiry._id}`
    });
    
    res.json({
      success: true,
      inquiry
    });
  } catch (error) {
    console.error('문의 상세 정보 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '문의 정보를 불러오는 중 오류가 발생했습니다'
    });
  }
});

// 문의 답변 등록
router.post('/inquiries/:inquiryId/reply', protect, adminCheck, async (req, res) => {
  try {
    const { content, status } = req.body;
    
    // Inquiry 모델이 있는지 확인
    let Inquiry;
    try {
      Inquiry = mongoose.model('Inquiry');
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '문의 모델을 찾을 수 없습니다'
      });
    }
    
    const inquiry = await Inquiry.findById(req.params.inquiryId);
    
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: '문의를 찾을 수 없습니다'
      });
    }
    
    // 답변 추가
    inquiry.replies.push({
      content,
      admin: req.user._id,
      createdAt: new Date()
    });
    
    // 상태 업데이트
    if (status) {
      inquiry.status = status;
    }
    
    inquiry.updatedAt = new Date();
    
    await inquiry.save();
    
    // 사용자 활동 로그
    await Activity.create({
      user: req.user._id,
      action: '문의 답변 등록',
      details: `문의 ID: ${inquiry._id}, 상태: ${status || inquiry.status}`
    });
    
    res.json({
      success: true,
      message: '답변이 등록되었습니다',
      inquiry
    });
  } catch (error) {
    console.error('문의 답변 등록 오류:', error);
    res.status(500).json({
      success: false,
      message: '답변 등록 중 오류가 발생했습니다'
    });
  }
});

// FAQ 목록 조회
router.get('/faqs', protect, adminCheck, async (req, res) => {
  try {
    const faqs = await Faq.find()
      .sort({ order: 1, createdAt: -1 });
    
    res.json({
      success: true,
      faqs
    });
  } catch (error) {
    console.error('FAQ 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// FAQ 개별 조회
router.get('/faqs/:id', protect, adminCheck, async (req, res) => {
  try {
    const faq = await Faq.findById(req.params.id);
    
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ를 찾을 수 없습니다.'
      });
    }
    
    res.json({
      success: true,
      faq
    });
  } catch (error) {
    console.error('FAQ 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// FAQ 생성
router.post('/faqs', protect, adminCheck, async (req, res) => {
  try {
    const { question, answer, category, order, status } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: '질문과 답변은 필수 항목입니다.'
      });
    }
    
    const faq = new Faq({
      question,
      answer,
      category: category || '일반',
      order: order || 0,
      status: status || 'published',
      author: req.user._id
    });
    
    await faq.save();
    
    // 활동 로그 기록
    await Activity.create({
      user: req.user._id,
      action: 'FAQ 생성',
      details: `질문: ${question}`
    });
    
    res.status(201).json({
      success: true,
      faq
    });
  } catch (error) {
    console.error('FAQ 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// FAQ 수정
router.put('/faqs/:id', protect, adminCheck, async (req, res) => {
  try {
    const { question, answer, category, order, status } = req.body;
    
    const faq = await Faq.findById(req.params.id);
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ를 찾을 수 없습니다.'
      });
    }
    
    faq.question = question || faq.question;
    faq.answer = answer || faq.answer;
    faq.category = category || faq.category;
    faq.order = order !== undefined ? order : faq.order;
    faq.status = status || faq.status;
    
    await faq.save();
    
    // 활동 로그 기록
    await Activity.create({
      user: req.user._id,
      action: 'FAQ 수정',
      details: `질문: ${faq.question}`
    });
    
    res.json({
      success: true,
      faq
    });
  } catch (error) {
    console.error('FAQ 수정 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// FAQ 삭제
router.delete('/faqs/:id', protect, adminCheck, async (req, res) => {
  try {
    const faq = await Faq.findById(req.params.id);
    
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ를 찾을 수 없습니다.'
      });
    }
    
    await faq.remove();
    
    // 활동 로그 기록
    await Activity.create({
      user: req.user._id,
      action: 'FAQ 삭제',
      details: `질문: ${faq.question}`
    });
    
    res.json({
      success: true,
      message: 'FAQ가 삭제되었습니다.'
    });
  } catch (error) {
    console.error('FAQ 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 멤버십 관리 (유저 상세 페이지에서 직접 멤버십 변경)
router.post('/users/:userId/membership', protect, adminCheck, async (req, res) => {
  try {
    const { status, duration, action } = req.body;
    const userId = req.params.userId;
    
    // 해당 유저 찾기
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }
    
    // 멤버십 상태 업데이트
    if (action === 'approve' || status === 'active') {
      const today = new Date();
      const expireDate = new Date();
      
      // 기간에 따라 만료일 설정
      let months = 1; // 기본값 1개월
      
      if (duration === '1month' || duration === '1') {
        months = 1;
      } else if (duration === '3months' || duration === '3') {
        months = 3;
      } else if (duration === '6months' || duration === '6') {
        months = 6;
      } else if (duration === '12months' || duration === '12') {
        months = 12;
      }
      
      expireDate.setMonth(expireDate.getMonth() + months);
      
      // 사용자 정보 업데이트
      user.level = 'vip';
      user.membershipStatus = 'active';
      user.membershipExpires = expireDate;
      user.membershipStartDate = today;
      user.membershipDuration = duration;
    } else if (action === 'cancel' || status === 'none') {
      // 멤버십 취소
      user.level = 'level1';
      user.membershipStatus = 'none';
      user.membershipExpires = null;
    }
    
    await user.save();
    
    // 활동 로그 기록
    if (Activity) {
      await Activity.create({
        user: req.user._id,
        action: status === 'active' ? 'membership_activated' : 'membership_canceled',
        details: `${user.username} 사용자의 멤버십 상태 변경: ${status}`,
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      message: `사용자 ${user.username}의 멤버십 상태가 변경되었습니다.`,
      user: {
        id: user._id,
        username: user.username,
        level: user.level,
        membershipStatus: user.membershipStatus,
        membershipExpires: user.membershipExpires
      }
    });
  } catch (error) {
    console.error('멤버십 상태 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
