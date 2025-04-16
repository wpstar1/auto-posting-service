const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
let User;

// MongoDB 연결 여부에 따라 User 모델 로드
try {
  User = mongoose.model('User');
} catch (error) {
  User = require('../models/User');
}

/**
 * JWT 토큰 생성
 * @param {object} user - 사용자 객체
 * @returns {string} JWT 토큰
 */
exports.generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'your_jwt_secret',
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

/**
 * JWT 토큰 검증
 * @param {string} token - JWT 토큰
 * @returns {object} 디코딩된 토큰 정보
 */
exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
  } catch (error) {
    throw new Error('유효하지 않은 토큰입니다');
  }
};

/**
 * 사용자 ID로 사용자 조회
 * @param {string} id - 사용자 ID
 * @returns {Promise<object>} 사용자 객체
 */
exports.getUserById = async (id) => {
  try {
    return await User.findById(id);
  } catch (error) {
    throw new Error('사용자를 찾을 수 없습니다');
  }
};

/**
 * 인증 설정
 */
exports.authConfig = {
  tokenExpiration: process.env.JWT_EXPIRE || '30d',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    maxAge: 24 * 60 * 60 * 1000 // 1일
  }
}; 