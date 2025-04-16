const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middlewares/auth');
const router = express.Router();

let Platform, User;
try {
    Platform = mongoose.model('Platform');
    User = mongoose.model('User');
} catch (error) {
    Platform = require('../models/Platform');
    User = require('../models/User');
}

// 사용자 레벨 확인 유틸리티 함수
const getUserLevel = async (userId) => {
    try {
        const user = await User.findById(userId);
        return user && user.level === 'vip' ? 'vip' : 'level1';
    } catch (error) {
        console.error('사용자 레벨 확인 오류:', error);
        return 'level1'; // 오류 발생 시 기본값 반환
    }
};

// 워드프레스 계정 목록 조회
router.get('/', protect, async (req, res) => {
    try {
        const platforms = await Platform.find({ user: req.user.id })
            .select('-password');  // 비밀번호 필드 제외

        res.json({
            success: true,
            data: platforms.map(platform => ({
                _id: platform._id,
                name: platform.name,
                url: platform.url,
                username: platform.username,
                type: platform.type,
                status: platform.status,
                lastChecked: platform.lastChecked
            }))
        });
    } catch (error) {
        console.error('계정 목록 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '계정 목록을 불러오는데 실패했습니다.'
        });
    }
});

// 워드프레스 계정 추가
router.post('/', protect, async (req, res) => {
    try {
        const { name, url, username, password, appKey } = req.body;

        // 필수 항목 확인
        if (!name || !url || !username || !password || !appKey) {
            return res.status(400).json({ 
                success: false, 
                message: '모든 필드를 입력해주세요.' 
            });
        }

        // Level 1 사용자는 최대 1개 계정만 등록 가능
        const userLevel = await getUserLevel(req.user.id);
        if (userLevel !== 'vip') {
            const existingPlatforms = await Platform.find({ 
                user: req.user.id,
                type: 'wordpress'
            });

            if (existingPlatforms.length >= 1) {
                return res.status(403).json({
                    success: false,
                    message: 'VIP 회원만 여러 계정을 추가할 수 있습니다. 현재 일반 회원은 최대 1개 계정만 추가 가능합니다.'
                });
            }
        }

        // URL 형식 검증
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return res.status(400).json({
                success: false,
                message: 'URL은 http:// 또는 https://로 시작해야 합니다.'
            });
        }

        // 새 계정 생성
        const platform = new Platform({
            user: req.user.id,
            name,
            url: url.trim(),
            username,
            password,
            appKey,
            type: 'wordpress'
        });

        // 연결 테스트
        const connectionResult = await platform.checkConnection();
        if (!connectionResult.success) {
            return res.status(400).json({
                success: false,
                message: '워드프레스 연결 테스트에 실패했습니다: ' + connectionResult.message
            });
        }

        await platform.save();

        res.status(201).json({
            success: true,
            data: {
                _id: platform._id,
                name: platform.name,
                url: platform.url,
                username: platform.username,
                type: platform.type,
                status: platform.status,
                lastChecked: platform.lastChecked
            }
        });
    } catch (error) {
        console.error('계정 추가 실패:', error);
        res.status(500).json({
            success: false,
            message: '계정 추가에 실패했습니다.'
        });
    }
});

// 워드프레스 계정 상세 조회
router.get('/:id', protect, async (req, res) => {
    try {
        // 비밀번호와 앱키 필드를 포함하여 조회
        const platform = await Platform.findOne({
            _id: req.params.id,
            user: req.user.id
        }).select('+password +appKey');  // 명시적으로 비밀번호와 앱키 필드 포함

        if (!platform) {
            return res.status(404).json({
                success: false,
                message: '계정을 찾을 수 없습니다.'
            });
        }

        // 비밀번호와 앱키 복호화
        let decryptedPassword = null;
        let decryptedAppKey = null;
        
        try {
            decryptedPassword = platform.getDecryptedPassword();
            if (platform.appKey) {
                decryptedAppKey = platform.getDecryptedAppKey();
            }
        } catch (error) {
            console.error('암호화된 정보 복호화 중 오류:', error);
        }

        res.json({
            success: true,
            data: {
                _id: platform._id,
                name: platform.name,
                url: platform.url,
                username: platform.username,
                password: decryptedPassword,  // 복호화된 비밀번호 반환
                appKey: decryptedAppKey,      // 복호화된 앱키 반환
                type: platform.type,
                status: platform.connectionStatus,
                lastChecked: platform.lastConnectionCheck
            }
        });
    } catch (error) {
        console.error('계정 조회 실패:', error);
        res.status(500).json({
            success: false, 
            message: '계정 정보를 불러오는데 실패했습니다.'
        });
    }
});

// 워드프레스 계정 수정
router.put('/:id', protect, async (req, res) => {
    try {
        const platform = await Platform.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!platform) {
            return res.status(404).json({
                success: false,
                message: '계정을 찾을 수 없습니다.'
            });
        }

        const { name, url, username, password, appKey } = req.body;

        // URL 형식 검증
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return res.status(400).json({
                success: false,
                message: 'URL은 http:// 또는 https://로 시작해야 합니다.'
            });
        }

        // 필드 업데이트
        platform.name = name;
        platform.url = url.trim();
        platform.username = username;
        if (password) {
            platform.password = password;
        }
        if (appKey) {
            platform.appKey = appKey;
        }

        // 연결 테스트
        const connectionResult = await platform.checkConnection();
        if (!connectionResult.success) {
            return res.status(400).json({
                success: false,
                message: '워드프레스 연결 테스트에 실패했습니다: ' + connectionResult.message
            });
        }

        await platform.save();

        res.json({
            success: true,
            data: {
                _id: platform._id,
                name: platform.name,
                url: platform.url,
                username: platform.username,
                type: platform.type,
                status: platform.status,
                lastChecked: platform.lastChecked
            }
        });
    } catch (error) {
        console.error('계정 수정 실패:', error);
        res.status(500).json({
            success: false,
            message: '계정 수정에 실패했습니다.'
        });
    }
});

// 워드프레스 계정 삭제
router.delete('/:id', protect, async (req, res) => {
    try {
        const platform = await Platform.findOneAndDelete({
            _id: req.params.id,
            user: req.user.id
        });

        if (!platform) {
            return res.status(404).json({
                success: false,
                message: '계정을 찾을 수 없습니다.'
            });
        }

        res.json({
            success: true,
            message: '계정이 삭제되었습니다.'
        });
    } catch (error) {
        console.error('계정 삭제 실패:', error);
        res.status(500).json({
            success: false,
            message: '계정 삭제에 실패했습니다.'
        });
    }
});

// 워드프레스 연결 테스트
router.post('/:id/test', protect, async (req, res) => {
    try {
        const platform = await Platform.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!platform) {
            return res.status(404).json({
                success: false,
                message: '계정을 찾을 수 없습니다.'
            });
        }

        const result = await platform.checkConnection();
        res.json(result);
    } catch (error) {
        console.error('연결 테스트 실패:', error);
        res.status(500).json({
            success: false,
            message: '연결 테스트에 실패했습니다.'
        });
    }
});

module.exports = router;
