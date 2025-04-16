const mongoose = require('mongoose');

const InquirySchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, '제목은 필수 입력값입니다'],
        trim: true
    },
    content: {
        type: String,
        required: [true, '내용은 필수 입력값입니다'],
        trim: true
    },
    author: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed'],
        default: 'pending'
    },
    response: {
        type: String,
        default: ''
    },
    isVip: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Inquiry', InquirySchema);
