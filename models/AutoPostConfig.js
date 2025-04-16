const mongoose = require('mongoose');

const AutoPostConfigSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    platform: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Platform',
        required: true
    },
    contentStyle: {
        type: String,
        enum: ['professional_guide', 'story_experience', 'qa_format'],
        default: 'professional_guide'
    },
    keywords: {
        type: String,
        required: true
    },
    frequency: {
        type: Number,
        min: 1,
        max: 24,
        default: 24 // 기본값: 하루에 한 번
    },
    keywordDensity: {
        type: Number,
        min: 1,
        max: 5,
        default: 2.8
    },
    minWordCount: {
        type: Number,
        min: 500,
        default: 800
    },
    useInternalLinks: {
        type: Boolean,
        default: false
    },
    internalLinks: {
        type: Array,
        default: []
    },
    imageCount: {
        type: Number,
        min: 0,
        max: 5,
        default: 1
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'stopped'],
        default: 'active'
    },
    lastPostedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // 자동으로 createdAt, updatedAt 필드 관리
});

// 인덱스 설정
AutoPostConfigSchema.index({ user: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('AutoPostConfig', AutoPostConfigSchema);
