const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middlewares/auth');
const router = express.Router();
const bcrypt = require('bcrypt');

let User;
try {
  User = mongoose.model('User');
} catch (error) {
  User = require('../models/User');
}

// 회원가입
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, passwordConfirm } = req.body;
    
    // 기본 검증
    if (!username || !email || !password || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        error: '모든 필드를 입력해주세요'
      });
    }

    // 비밀번호 확인
    if (password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        error: '비밀번호가 일치하지 않습니다'
      });
    }
    
    // 중복 확인
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: '이미 사용 중인 아이디 또는 이메일입니다'
      });
    }
    
    // 사용자 생성
    const user = await User.create({
      username,
      email,
      password
    });
    
    // 토큰 생성
    const token = user.getSignedJwtToken();
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        level: user.level,
        membershipStatus: user.membershipStatus,
        role: user.role
      }
    });
  } catch (error) {
    console.error('회원가입 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 기본 검증
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '아이디와 비밀번호를 모두 입력해주세요'
      });
    }

    // 사용자 찾기
    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '아이디 또는 비밀번호가 일치하지 않습니다'
      });
    }

    // 비밀번호 확인
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: '아이디 또는 비밀번호가 일치하지 않습니다'
      });
    }

    // JWT 토큰 생성
    const token = user.getSignedJwtToken();
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        level: user.level,
        membershipStatus: user.membershipStatus,
        role: user.role
      }
    });
  } catch (error) {
    console.error('로그인 오류:', error);
    res.status(500).json({
      success: false,
      message: '로그인 중 오류가 발생했습니다'
    });
  }
});

// 프로필 정보 조회
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 프로필 수정
router.put('/profile', protect, async (req, res) => {
  try {
    const { username } = req.body;

    // 입력값 검증
    if (!username || username.trim().length < 2) {
      return res.status(400).json({ success: false, error: '사용자명은 2자 이상이어야 합니다.' });
    }

    // 사용자명 중복 체크
    const existingUser = await User.findOne({ username, _id: { $ne: req.user.id } });
    if (existingUser) {
      return res.status(400).json({ success: false, error: '이미 사용 중인 사용자명입니다.' });
    }

    // 프로필 업데이트
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { username } },
      { new: true }
    ).select('-password');

    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 비밀번호 변경
router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // 입력값 검증
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: '모든 필드를 입력해주세요.' });
    }

    // 비밀번호 복잡도 검증
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: '비밀번호는 8자 이상이어야 합니다.' });
    }

    // 현재 사용자 정보 조회
    const user = await User.findById(req.user.id);

    // 현재 비밀번호 확인
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: '현재 비밀번호가 일치하지 않습니다.' });
    }

    // 새 비밀번호 해시화
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ success: true, message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 사용자 레벨 조회
router.get('/level', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }

    res.status(200).json({
      success: true,
      level: user.level
    });
  } catch (error) {
    console.error('사용자 레벨 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다'
    });
  }
});

// VIP 신청
router.post('/request-vip', protect, async (req, res) => {
  try {
    const { duration, message } = req.body;
    
    // 이미 VIP이거나 승인 대기 중인 경우 체크
    if (req.user.level === 'vip' || req.user.membershipStatus === 'pending') {
      return res.status(400).json({
        success: false,
        message: '이미 VIP 회원이거나 신청 대기 중입니다.'
      });
    }
    
    // 사용자 정보 업데이트
    req.user.membershipStatus = 'pending';
    req.user.vipRequestDate = new Date();
    req.user.vipRequestMessage = message || '';
    req.user.membershipDuration = duration || '1month';
    
    await req.user.save();
    
    res.json({
      success: true,
      message: 'VIP 신청이 완료되었습니다. 관리자 승인 후 서비스 이용이 가능합니다.',
      status: 'pending'
    });
  } catch (error) {
    console.error('VIP 신청 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 멤버십 상태 확인
router.get('/membership', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    // VIP 만료 확인
    if (user.membershipStatus === 'active' && user.membershipExpires) {
      const now = new Date();
      
      // 만료된 경우 상태 업데이트
      if (now > new Date(user.membershipExpires)) {
        user.membershipStatus = 'expired';
        user.level = 'level1';
        await user.save();
      }
    }
    
    // 남은 일수 계산
    let daysLeft = 0;
    if (user.membershipStatus === 'active' && user.membershipExpires) {
      const now = new Date();
      const expiry = new Date(user.membershipExpires);
      daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
    }
    
    res.json({
      success: true,
      membership: {
        level: user.level,
        status: user.membershipStatus,
        expires: user.membershipExpires,
        daysLeft,
        startDate: user.membershipStartDate,
        duration: user.membershipDuration
      }
    });
  } catch (error) {
    console.error('멤버십 상태 확인 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 관리자 권한 확인
router.get('/check-admin', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const isAdmin = user && user.role === 'admin';
    
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

module.exports = router;