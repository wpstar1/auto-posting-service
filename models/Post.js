const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  platformId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Platform',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  images: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Image'
  }],
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'published', 'failed'],
    default: 'draft'
  },
  scheduledAt: {
    type: Date
  },
  publishedAt: {
    type: Date
  },
  error: {
    type: String
  },
  tags: [{
    type: String,
    trim: true
  }],
  useRandomImages: {
    type: Boolean,
    default: false
  },
  randomImageTags: [{
    type: String,
    trim: true
  }],
  randomImageCount: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  wordpressPostId: {
    type: String
  }
}, {
  timestamps: true
});

// 예약된 포스트 조회
PostSchema.statics.findDueScheduledPosts = function() {
  return this.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() }
  })
  .populate('userId')
  .populate('platformId')
  .populate('images');
};

module.exports = mongoose.model('Post', PostSchema);
