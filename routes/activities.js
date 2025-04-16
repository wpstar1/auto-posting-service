const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');

// 임시 활동 저장
if (!global.userActivities) {
    global.userActivities = {};
}

// 활동 기록 함수 (다른 라우터에서 활용 가능)
const recordActivity = (userId, description) => {
    if (!global.userActivities[userId]) {
        global.userActivities[userId] = [];
    }
    
    // 새로운 활동 추가
    global.userActivities[userId].unshift({
        id: Date.now().toString(),
        timestamp: new Date(),
        description
    });
    
    // 최대 50개까지만 저장
    if (global.userActivities[userId].length > 50) {
        global.userActivities[userId] = global.userActivities[userId].slice(0, 50);
    }
};

// 사용자의 최근 활동 목록 가져오기
router.get('/', protect, async (req, res) => {
    try {
        if (!global.userActivities[req.user.id]) {
            global.userActivities[req.user.id] = [];
        }
        
        // 테스트 데이터 추가 (처음 방문 시 빈 화면이 나오지 않도록)
        if (global.userActivities[req.user.id].length === 0) {
            const now = new Date();
            global.userActivities[req.user.id] = [
                {
                    id: '1',
                    timestamp: new Date(now.getTime() - 30 * 60000), // 30분 전
                    description: '계정에 로그인했습니다.'
                },
                {
                    id: '2',
                    timestamp: new Date(now.getTime() - 60 * 60000), // 1시간 전
                    description: '대시보드를 확인했습니다.'
                },
                {
                    id: '3',
                    timestamp: new Date(now.getTime() - 2 * 60 * 60000), // 2시간 전
                    description: '워드프레스 계정 연결 상태를 확인했습니다.'
                }
            ];
        }
        
        return res.status(200).json({
            success: true,
            activities: global.userActivities[req.user.id]
        });
        
    } catch (error) {
        console.error('활동 기록 조회 오류:', error);
        return res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

// 활동 기록 추가
router.post('/', protect, async (req, res) => {
    try {
        const { description } = req.body;
        
        if (!description) {
            return res.status(400).json({
                success: false,
                message: '활동 설명이 필요합니다.'
            });
        }
        
        recordActivity(req.user.id, description);
        
        return res.status(201).json({
            success: true,
            message: '활동이 기록되었습니다.'
        });
        
    } catch (error) {
        console.error('활동 기록 저장 오류:', error);
        return res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

module.exports = {
    router,
    recordActivity
};
