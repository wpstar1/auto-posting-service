const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    notifications: {
        email: {
            type: Boolean,
            default: true
        },
        postSuccess: {
            type: Boolean,
            default: true
        },
        postError: {
            type: Boolean,
            default: true
        }
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

// updatedAt 자동 업데이트
userSettingsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);
