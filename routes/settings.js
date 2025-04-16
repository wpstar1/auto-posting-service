const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const UserSettings = require('../models/UserSettings');

// 알림 설정 조회
router.get('/notifications', protect, async (req, res) => {
    try {
        let settings = await UserSettings.findOne({ user: req.user.id });
        
        // 설정이 없으면 기본값으로 생성
        if (!settings) {
            settings = await UserSettings.create({
                user: req.user.id,
                notifications: {
                    email: true,
                    postSuccess: true,
                    postError: true
                }
            });
        }

        res.json({
            success: true,
            settings: {
                emailNotification: settings.notifications.email,
                postSuccess: settings.notifications.postSuccess,
                postError: settings.notifications.postError
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

// 알림 설정 업데이트
router.put('/notifications', protect, async (req, res) => {
    try {
        const { emailNotification, postSuccess, postError } = req.body;

        // 모든 필드가 boolean 타입인지 확인
        if (typeof emailNotification !== 'boolean' ||
            typeof postSuccess !== 'boolean' ||
            typeof postError !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: '잘못된 입력값입니다.'
            });
        }

        // upsert 옵션으로 설정이 없으면 생성
        const settings = await UserSettings.findOneAndUpdate(
            { user: req.user.id },
            {
                $set: {
                    'notifications.email': emailNotification,
                    'notifications.postSuccess': postSuccess,
                    'notifications.postError': postError,
                    updatedAt: new Date()
                }
            },
            { new: true, upsert: true }
        );

        res.json({
            success: true,
            settings: {
                emailNotification: settings.notifications.email,
                postSuccess: settings.notifications.postSuccess,
                postError: settings.notifications.postError
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
