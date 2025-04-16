const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const mongoose = require('mongoose');

// 모델 로드
let User;
let Platform;
let Post;
let Activity;
let SystemConfig;

try {
  User = mongoose.model('User');
  Platform = mongoose.model('Platform');
  Post = mongoose.model('Post');
  Activity = mongoose.model('Activity');
  SystemConfig = mongoose.model('SystemConfig');
} catch (error) {
  User = require('../models/User');
  Platform = require('../models/Platform') || mongoose.model('Platform', new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    platformName: String,
    url: String,
    username: String,
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  }));
  Post = require('../models/Post') || mongoose.model('Post', new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    platform: { type: mongoose.Schema.Types.ObjectId, ref: 'Platform' },
    title: String,
    content: String,
    status: String,
    scheduledTime: Date,
    publishedTime: Date,
    createdAt: { type: Date, default: Date.now }
  }));
  Activity = require('../models/Activity');
  SystemConfig = require('../models/SystemConfig');
}

// 대시보드 전체 통계
router.get('/stats', protect, async (req, res) => {
  try {
    // 1. 시스템 설정 가져오기 (일일 포스팅 제한 등)
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

    // 2. 계정 수 통계
    const totalAccounts = await Platform.countDocuments({ user: req.user._id });
    const activeAccounts = await Platform.countDocuments({ 
      user: req.user._id, 
      active: true 
    });
    
    // 3. 남은 포스팅 수 계산
    let dailyLimit;
    if (req.user.membershipStatus === 'active' || req.user.role === 'admin') {
      // VIP 회원과 관리자는 무제한 (높은 수로 표현)
      dailyLimit = 999;
    } else {
      // 일반 회원은 기본 제한
      dailyLimit = config.level1.dailyPostLimit || 3;
    }
    
    // 오늘 작성된 포스팅 수 계산
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayPosts = await Post.countDocuments({
      user: req.user._id,
      createdAt: { $gte: today }
    });
    
    const remainingPosts = Math.max(0, dailyLimit - todayPosts);
    
    // 4. 다음 예정 포스팅
    const now = new Date();
    const nextScheduledPost = await Post.findOne({
      user: req.user._id,
      status: 'scheduled',
      scheduledTime: { $gt: now }
    }).sort({ scheduledTime: 1 });
    
    // 5. 최근 활동
    const recentActivities = await Activity.find({
      user: req.user._id
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    // 활동 내역을 사용자 친화적인 형태로 변환
    const formattedActivities = recentActivities.map(activity => {
      const formattedActivity = {
        _id: activity._id,
        createdAt: activity.createdAt,
        action: formatActivityAction(activity.action),
        details: formatActivityDetails(activity.action, activity.details)
      };
      return formattedActivity;
    });
    
    // 결과 반환
    res.json({
      success: true,
      stats: {
        accounts: {
          total: totalAccounts,
          active: activeAccounts
        },
        posts: {
          daily_limit: dailyLimit,
          today_used: todayPosts,
          remaining: remainingPosts
        },
        nextScheduledPost: nextScheduledPost,
        recentActivities: formattedActivities
      }
    });
  } catch (error) {
    console.error('대시보드 통계 에러:', error);
    res.status(500).json({
      success: false,
      message: '대시보드 통계를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 남은 포스팅 수 조회
router.get('/remaining-posts', protect, async (req, res) => {
  try {
    // 시스템 설정 가져오기
    let config = await SystemConfig.findOne();
    if (!config) {
      config = {
        level1: { dailyPostLimit: 3 }
      };
    }
    
    // 사용자의 멤버십 상태에 따라 제한 설정
    let dailyLimit;
    if (req.user.membershipStatus === 'active' || req.user.role === 'admin') {
      // VIP 회원과 관리자는 무제한 (높은 수로 표현)
      dailyLimit = 999;
    } else {
      // 일반 회원은 기본 제한
      dailyLimit = config.level1.dailyPostLimit || 3;
    }
    
    // 오늘 작성된 포스팅 수 계산
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayPosts = await Post.countDocuments({
      user: req.user._id,
      createdAt: { $gte: today }
    });
    
    const remainingPosts = Math.max(0, dailyLimit - todayPosts);
    
    res.json({
      success: true,
      remaining: remainingPosts,
      total: dailyLimit,
      used: todayPosts
    });
  } catch (error) {
    console.error('남은 포스팅 수 조회 에러:', error);
    res.status(500).json({
      success: false,
      message: '남은 포스팅 수를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 다음 예정 포스팅 조회
router.get('/next-post', protect, async (req, res) => {
  try {
    const now = new Date();
    const nextPost = await Post.findOne({
      user: req.user._id,
      status: 'scheduled',
      scheduledTime: { $gt: now }
    })
    .sort({ scheduledTime: 1 })
    .populate('platform', 'platformName url');
    
    res.json({
      success: true,
      nextPost
    });
  } catch (error) {
    console.error('다음 예정 포스팅 조회 에러:', error);
    res.status(500).json({
      success: false,
      message: '다음 예정 포스팅을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 계정 통계 조회
router.get('/accounts', protect, async (req, res) => {
  try {
    const totalAccounts = await Platform.countDocuments({ user: req.user._id });
    const activeAccounts = await Platform.countDocuments({ 
      user: req.user._id, 
      active: true 
    });
    
    const accountsList = await Platform.find({ user: req.user._id })
      .select('platformName url username active')
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      success: true,
      total: totalAccounts,
      active: activeAccounts,
      recentAccounts: accountsList
    });
  } catch (error) {
    console.error('계정 통계 조회 에러:', error);
    res.status(500).json({
      success: false,
      message: '계정 통계를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 최근 활동 조회
router.get('/activities', protect, async (req, res) => {
  try {
    const activities = await Activity.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // 활동 내역을 사용자 친화적인 형태로 변환
    const formattedActivities = activities.map(activity => {
      const formattedActivity = {
        _id: activity._id,
        createdAt: activity.createdAt,
        action: formatActivityAction(activity.action),
        details: formatActivityDetails(activity.action, activity.details)
      };
      return formattedActivity;
    });
    
    res.json({
      success: true,
      activities: formattedActivities
    });
  } catch (error) {
    console.error('최근 활동 조회 에러:', error);
    res.status(500).json({
      success: false,
      message: '최근 활동을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 활동 내역의 액션을 사용자 친화적인 텍스트로 변환
function formatActivityAction(action) {
  switch(action) {
    case '멤버십 정보 업데이트':
      return '회원 등급 변경';
    case '사용자 정보 조회':
      return '내 정보 확인';
    case '문의 목록 조회':
      return '고객 문의 확인';
    case '공지사항 생성':
      return '공지사항 작성';
    case '공지사항 수정':
      return '공지사항 수정';
    case '포스팅 작성':
      return '글 작성';
    case '포스팅 예약':
      return '글 예약 등록';
    case '계정 추가':
      return '워드프레스 계정 추가';
    default:
      return action;
  }
}

// 활동 내역의 상세 정보를 사용자 친화적인 텍스트로 변환
function formatActivityDetails(action, details) {
  if (!details) return '';
  
  // membership_undefined 같은 문제 해결
  if (details.includes('membership_undefined')) {
    return '회원 등급 정보 업데이트';
  }
  
  // 필터 정보 포함 로그 간소화
  if (details.includes('필터:')) {
    return '';
  }
  
  // 사용자 ID 포함된 로그 간소화
  if (details.includes('(') && details.includes(')')) {
    return details.split('(')[0].trim();
  }
  
  return details;
}

module.exports = router;
