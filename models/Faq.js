const mongoose = require('mongoose');

const FaqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, '질문은 필수 입력값입니다'],
    trim: true
  },
  answer: {
    type: String,
    required: [true, '답변은 필수 입력값입니다'],
    trim: true
  },
  category: {
    type: String,
    default: '일반',
    enum: ['일반', '계정', '포스팅', '결제', '기타']
  },
  order: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    default: 'published',
    enum: ['published', 'draft']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Faq', FaqSchema);
