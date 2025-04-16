const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalname: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  // 키워드 검색 기능 강화를 위한 필드
  keywords: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    enum: ['자연', '비즈니스', '기술', '교육', '음식', '건강', '여행', '패션', '스포츠', '엔터테인먼트', '기타'],
    default: '기타'
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsed: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// 이미지 사용 횟수 증가
ImageSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  this.lastUsed = new Date();
  await this.save();
};

// 키워드 기반 이미지 검색 정적 메소드 추가
ImageSchema.statics.findByKeyword = async function(userId, keyword, limit = 3) {
  if (!keyword) return [];
  
  // 키워드를 소문자로 변환하고 공백 제거
  const searchKeyword = keyword.toLowerCase().trim();
  
  // 단어 분리
  const words = searchKeyword.split(/\s+/);
  
  return this.find({
    userId: userId,
    $or: [
      // 태그 검색
      { tags: { $in: [new RegExp(searchKeyword, 'i')] } },
      // 키워드 검색
      { keywords: { $in: [new RegExp(searchKeyword, 'i')] } },
      // 각 단어 검색
      { tags: { $in: words.map(word => new RegExp(word, 'i')) } },
      { keywords: { $in: words.map(word => new RegExp(word, 'i')) } },
      // 카테고리 검색
      { category: { $regex: searchKeyword, $options: 'i' } }
    ]
  })
  .sort({ usageCount: 1, createdAt: -1 }) // 덜 사용된 최신 이미지 우선
  .limit(limit);
};

module.exports = mongoose.model('Image', ImageSchema);
