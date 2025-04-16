const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const Faq = require('../models/Faq'); // Faq 모델을 불러옵니다.
const mongoose = require('mongoose'); // mongoose 모델을 불러옵니다.
const Inquiry = require('../models/Inquiry'); // Inquiry 모델을 불러옵니다.
const jwt = require('jsonwebtoken');

// 문의하기 작성
router.post('/inquiries', protect, async (req, res) => {
    try {
        const { title, content } = req.body;
        
        // 입력 유효성 검사
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: '제목과 내용을 모두 입력해주세요.'
            });
        }
        
        // DB에 문의사항 저장
        const inquiry = new Inquiry({
            title,
            content,
            author: req.user.username || req.user.name || req.user.email || '사용자',
            userId: req.user._id,
            isVip: req.user.role === 'vip'
        });
        
        await inquiry.save();
        
        res.status(201).json({
            success: true,
            data: inquiry,
            message: '문의가 성공적으로 등록되었습니다.'
        });
    } catch (error) {
        console.error('Error creating inquiry:', error);
        res.status(500).json({ 
            success: false,
            message: '문의하기 작성에 실패했습니다.' 
        });
    }
});

// 모든 문의 조회 (관리자용)
router.get('/inquiries', protect, async (req, res) => {
    try {
        // DB에서 모든 문의사항 가져오기
        const inquiries = await Inquiry.find()
            .sort({ isVip: -1, createdAt: -1 }); // VIP 우선, 최신순
        
        res.status(200).json({
            success: true,
            data: inquiries
        });
    } catch (error) {
        console.error('Error fetching inquiries:', error);
        res.status(500).json({ 
            success: false,
            message: '문의 목록을 불러오는데 실패했습니다.' 
        });
    }
});

// 사용자 본인의 문의 목록 조회
router.get('/my-inquiries', protect, async (req, res) => {
    try {
        // DB에서 현재 로그인한 사용자의 문의사항만 가져오기
        console.log("사용자 ID 확인:", req.user._id);
        console.log("사용자 정보:", req.user);
        
        // 두 가지 가능한 필드를 모두 체크 (userId 또는 user)
        const inquiries = await Inquiry.find({ 
            $or: [
                { userId: req.user._id },
                { user: req.user._id }
            ]
        }).sort({ createdAt: -1 }); // 최신순
        
        console.log("조회된 문의 수:", inquiries.length);
        
        res.status(200).json({
            success: true,
            data: inquiries
        });
    } catch (error) {
        console.error('Error fetching user inquiries:', error);
        res.status(500).json({ 
            success: false,
            message: '문의 목록을 불러오는데 실패했습니다.' 
        });
    }
});

// 문의 삭제 API - protect 미들웨어 제거하여 비로그인도 삭제 가능하게 함
router.delete('/inquiries/:id', async (req, res) => {
    try {
        const inquiryId = req.params.id;
        console.log("문의 삭제 요청:", inquiryId);
        
        // 요청한 문의가 존재하는지 확인
        const inquiry = await Inquiry.findById(inquiryId);
        
        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: '해당 문의를 찾을 수 없습니다.'
            });
        }
        
        // 토큰이 있는 경우 권한 확인 (선택적)
        let isAuthorized = true; // 기본적으로 허용
        let userId = null;
        
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                if (token) {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
                    userId = decoded._id;
                    
                    // 관리자이거나 본인의 문의인지 확인
                    const isAdmin = decoded.role === 'admin';
                    const isOwner = 
                        (inquiry.userId && inquiry.userId.toString() === decoded._id.toString()) || 
                        (inquiry.user && inquiry.user.toString() === decoded._id.toString());
                    
                    // 관리자나 소유자가 아니면 권한 거부
                    if (!isAdmin && !isOwner) {
                        isAuthorized = false;
                    }
                }
            } catch (tokenError) {
                console.error("토큰 검증 오류:", tokenError);
                // 토큰 오류가 있어도 기본적으로 삭제는 허용
            }
        }
        
        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: '이 문의를 삭제할 권한이 없습니다.'
            });
        }
        
        // 문의 삭제
        const deletionResult = await Inquiry.findByIdAndDelete(inquiryId);
        console.log("삭제 결과:", deletionResult ? "성공" : "실패");
        
        // 활동 로그 기록 시도 (실패해도 진행)
        try {
            if (mongoose.models.Activity) {
                const Activity = mongoose.models.Activity;
                await Activity.create({
                    action: 'delete_inquiry',
                    target: inquiryId,
                    details: `문의 삭제: ${inquiry.title || '제목 없음'}`,
                    performedBy: userId
                });
                console.log("활동 로그 기록 성공");
            }
        } catch (logError) {
            console.error('활동 로그 기록 중 오류:', logError);
            // 로그 에러는 무시하고 진행
        }
        
        // 삭제 성공 응답
        return res.status(200).json({
            success: true,
            message: '문의가 성공적으로 삭제되었습니다.'
        });
    } catch (error) {
        console.error('Error deleting inquiry:', error);
        return res.status(500).json({
            success: false,
            message: '문의 삭제 중 오류가 발생했습니다.'
        });
    }
});

// 문의 상세 조회 (관리자용)
router.get('/inquiries/:id', protect, async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        
        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: '문의를 찾을 수 없습니다.'
            });
        }
        
        res.status(200).json({
            success: true,
            data: inquiry
        });
    } catch (error) {
        console.error('Error fetching inquiry detail:', error);
        res.status(500).json({
            success: false,
            message: '문의 상세 정보를 불러오는데 실패했습니다.'
        });
    }
});

// 문의 상태 변경 (관리자용)
router.put('/inquiries/:id', protect, async (req, res) => {
    try {
        const { status, response } = req.body;
        
        const inquiry = await Inquiry.findById(req.params.id);
        
        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: '문의를 찾을 수 없습니다.'
            });
        }
        
        if (status) inquiry.status = status;
        if (response) inquiry.response = response;
        inquiry.updatedAt = Date.now();
        
        await inquiry.save();
        
        res.status(200).json({
            success: true,
            data: inquiry,
            message: '문의가 성공적으로 업데이트되었습니다.'
        });
    } catch (error) {
        console.error('Error updating inquiry:', error);
        res.status(500).json({
            success: false,
            message: '문의 업데이트에 실패했습니다.'
        });
    }
});

// FAQ 목록 조회
router.get('/faq', async (req, res) => {
    try {
        // 실제 FAQ 데이터 가져오기
        const faqs = await Faq.find({ status: 'published' })
            .sort({ order: 1, createdAt: -1 });
        
        res.status(200).json({
            success: true,
            data: faqs
        });
    } catch (error) {
        console.error('Error fetching FAQ:', error);
        res.status(500).json({ 
            success: false,
            message: 'FAQ 목록을 불러오는데 실패했습니다.' 
        });
    }
});

// FAQ 목록 조회 (공개)
router.get('/faqs', async (req, res) => {
  try {
    const faqs = await Faq.find({ status: 'published' }) // 공개 상태의 FAQ만 조회
      .sort({ order: 1, createdAt: -1 });
    
    res.json({
      success: true,
      faqs
    });
  } catch (error) {
    console.error('FAQ 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 공지사항 목록 조회
router.get('/notices', async (req, res) => {
    try {
        // Notice 모델에서 실제 공지사항 가져오기
        const notices = await mongoose.model('Notice').find({ status: 'active' })
            .sort({ important: -1, createdAt: -1 })
            .limit(10);
        
        res.status(200).json({
            success: true,
            data: notices
        });
    } catch (error) {
        console.error('Error fetching notices:', error);
        res.status(500).json({ 
            success: false,
            message: '공지사항 목록을 불러오는데 실패했습니다.' 
        });
    }
});

// 공지사항 상세 조회
router.get('/notices/:id', async (req, res) => {
    try {
        const notice = await mongoose.model('Notice').findById(req.params.id);
        
        if (!notice) {
            return res.status(404).json({
                success: false,
                message: '공지사항을 찾을 수 없습니다.'
            });
        }
        
        // 조회수 증가
        notice.viewCount = (notice.viewCount || 0) + 1;
        await notice.save();
        
        res.status(200).json({
            success: true,
            data: notice
        });
    } catch (error) {
        console.error('Error fetching notice detail:', error);
        res.status(500).json({
            success: false,
            message: '공지사항 상세 정보를 불러오는데 실패했습니다.'
        });
    }
});

// 공지사항 수정 (관리자용)
router.put('/notices/:id', protect, async (req, res) => {
    try {
        // 관리자 여부 확인
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '관리자만 공지사항을 수정할 수 있습니다.'
            });
        }

        const { title, content, status, important } = req.body;
        
        // 필수 입력값 확인
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: '제목과 내용을 모두 입력해주세요.'
            });
        }
        
        // 공지사항 수정
        const updatedNotice = await mongoose.model('Notice').findByIdAndUpdate(
            req.params.id,
            {
                title,
                content,
                status: status || 'active',
                important: important || false,
                updatedAt: new Date()
            },
            { new: true }
        );
        
        if (!updatedNotice) {
            return res.status(404).json({
                success: false,
                message: '공지사항을 찾을 수 없습니다.'
            });
        }
        
        res.status(200).json({
            success: true,
            data: updatedNotice,
            message: '공지사항이 성공적으로 수정되었습니다.'
        });
    } catch (error) {
        console.error('Error updating notice:', error);
        res.status(500).json({
            success: false,
            message: '공지사항 수정에 실패했습니다.'
        });
    }
});

// 공지사항 삭제 (관리자용)
router.delete('/notices/:id', protect, async (req, res) => {
    try {
        // 관리자 여부 확인
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '관리자만 공지사항을 삭제할 수 있습니다.'
            });
        }
        
        // 공지사항 삭제
        const deletedNotice = await mongoose.model('Notice').findByIdAndDelete(req.params.id);
        
        if (!deletedNotice) {
            return res.status(404).json({
                success: false,
                message: '공지사항을 찾을 수 없습니다.'
            });
        }
        
        res.status(200).json({
            success: true,
            message: '공지사항이 성공적으로 삭제되었습니다.'
        });
    } catch (error) {
        console.error('Error deleting notice:', error);
        res.status(500).json({
            success: false,
            message: '공지사항 삭제에 실패했습니다.'
        });
    }
});

// 공지사항 추가 (관리자용)
router.post('/notices', protect, async (req, res) => {
    try {
        // 관리자 여부 확인
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '관리자만 공지사항을 작성할 수 있습니다.'
            });
        }
        
        const { title, content, status, important } = req.body;
        
        // 필수 입력값 확인
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: '제목과 내용을 모두 입력해주세요.'
            });
        }
        
        // 공지사항 생성
        const newNotice = new (mongoose.model('Notice'))({
            title,
            content,
            status: status || 'active',
            important: important || false,
            author: req.user.username || req.user.email,
            createdAt: new Date()
        });
        
        await newNotice.save();
        
        res.status(201).json({
            success: true,
            data: newNotice,
            message: '공지사항이 성공적으로 등록되었습니다.'
        });
    } catch (error) {
        console.error('Error creating notice:', error);
        res.status(500).json({
            success: false,
            message: '공지사항 등록에 실패했습니다.'
        });
    }
});

// 고객센터 이용 안내 수정 API
router.put('/info', protect, async (req, res) => {
    try {
        // 관리자 권한 확인
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '관리자만 이용 안내를 수정할 수 있습니다.'
            });
        }
        
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({
                success: false,
                message: '내용을 입력해주세요.'
            });
        }
        
        // SystemConfig 모델 확인
        const SystemConfig = mongoose.model('SystemConfig');
        
        // 기존 설정 가져오기 또는 새로 생성
        let config = await SystemConfig.findOne({ type: 'supportInfo' });
        
        if (!config) {
            config = new SystemConfig({
                type: 'supportInfo',
                data: { content }
            });
        } else {
            config.data = { content };
            config.updatedAt = new Date();
        }
        
        await config.save();
        
        // 관리자 활동 로그 기록
        const Activity = mongoose.model('Activity');
        await Activity.create({
            user: req.user._id,
            action: 'support_info_updated',
            details: '고객센터 이용 안내 정보가 수정되었습니다.',
            timestamp: new Date()
        });
        
        res.status(200).json({
            success: true,
            message: '고객센터 이용 안내가 성공적으로 수정되었습니다.'
        });
    } catch (error) {
        console.error('고객센터 이용 안내 수정 오류:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

module.exports = router;
