const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, '아이디를 입력해주세요'],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, '이메일은 필수입니다'],
    unique: true
  },
  password: {
    type: String,
    required: [true, '비밀번호를 입력해주세요'],
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  level: {
    type: String,
    enum: ['level1', 'vip'],
    default: 'level1'
  },
  membershipStatus: {
    type: String,
    enum: ['none', 'pending', 'active', 'expired'],
    default: 'none'
  },
  membershipExpires: {
    type: Date,
    default: null
  },
  membershipDuration: {
    type: String,
    enum: ['none', '1month', '3months', '6months', '12months', '1', '3', '6', '12'],
    default: 'none'
  },
  membershipStartDate: {
    type: Date,
    default: null
  },
  vipRequestDate: {
    type: Date,
    default: null
  },
  vipRequestMessage: {
    type: String,
    default: ''
  },
  dailyPostCount: {
    type: Number,
    default: 0
  },
  lastPostDate: {
    type: Date,
    default: null
  },
  settings: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    timezone: {
      type: String,
      default: 'Asia/Seoul'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// 비밀번호 해싱
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// 비밀번호 검증 메소드
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// JWT 토큰 생성
UserSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { id: this._id, level: this.level },
    process.env.JWT_SECRET || 'your_jwt_secret',
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// 일일 포스팅 카운트 리셋
UserSchema.methods.resetDailyPostCount = function() {
  const today = new Date();
  const lastPost = this.lastPostDate;

  if (!lastPost || lastPost.getDate() !== today.getDate()) {
    this.dailyPostCount = 0;
    this.lastPostDate = today;
  }
};

// 포스팅 카운트 증가
UserSchema.methods.incrementPostCount = async function() {
  this.resetDailyPostCount();
  this.dailyPostCount += 1;
  await this.save();
};

module.exports = mongoose.model('User', UserSchema);