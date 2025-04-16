// Import required modules
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// 모델 불러오기
const User = require('./models/User');
const Platform = require('./models/Platform');
const AutoPostConfig = require('./models/AutoPostConfig');

// Import new logging and scheduling systems
const { logger } = require('./utils/logger');
const { scheduler } = require('./utils/scheduler');
const { notifier } = require('./utils/notifier');

// Import routes
const postRoutes = require('./server/post');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const platformRoutes = require('./routes/platforms');  // 수정: platform -> platforms
const autoPostRoutes = require('./routes/auto-post');
const dashboardRoutes = require('./routes/dashboard');
const activitiesModule = require('./routes/activities');
const activitiesRoutes = activitiesModule.router;
const supportRoutes = require('./routes/support');

// Import auth middleware
const { protect } = require('./middlewares/auth');

// Create Express App
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'your_cookie_secret'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB file size limit
});

// Serve static files
app.use(express.static(path.join(__dirname, 'client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API Routes ---
app.post('/api/post', upload.array('files', 10), postRoutes.autoPost);

// --- Admin Routes ---
app.use('/admin', adminRoutes);
app.use('/api/admin', adminRoutes); // API 호출을 위한 경로 추가

// --- Auth Routes ---
app.use('/api/auth', authRoutes);

// --- Platform Routes ---
app.use('/api/platforms', platformRoutes);

// --- Auto Post Routes ---
app.use('/api/auto-post', autoPostRoutes);

// --- Dashboard Routes ---
app.use('/dashboard', dashboardRoutes);

// --- Activities Routes ---
app.use('/api/activities', activitiesRoutes);

// --- Support Routes ---
app.use('/api/support', supportRoutes);

// --- User Settings Routes (직접 매핑) ---
app.get('/api/user/settings', protect, async (req, res) => {
  try {
    const user = await mongoose.model('User').findById(req.user.id).select('-wpPassword');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }
    
    res.status(200).json({
      success: true,
      settings: {
        email: user.email,
        wpUrl: user.wpUrl || '',
        wpUsername: user.wpUsername || ''
      }
    });
  } catch (error) {
    console.error('워드프레스 설정 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다'
    });
  }
});

app.put('/api/user/settings', protect, async (req, res) => {
  try {
    console.log('워드프레스 설정 업데이트 요청 받음', req.body);
    const { wpUrl, wpUsername, wpPassword } = req.body;
    
    // 필수 필드 검증 (URL과 사용자명은 필수)
    if (!wpUrl || !wpUsername) {
      return res.status(400).json({
        success: false,
        message: '워드프레스 URL과 사용자명은 필수입니다'
      });
    }
    
    // 사용자 조회
    const user = await mongoose.model('User').findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }
    
    // 기존 설정 업데이트
    user.wpUrl = wpUrl;
    user.wpUsername = wpUsername;
    
    // 비밀번호가 제공된 경우에만 업데이트
    if (wpPassword) {
      user.wpPassword = wpPassword;
    }
    
    // 저장
    await user.save();
    
    // 성공 응답
    res.status(200).json({
      success: true,
      message: '워드프레스 설정이 저장되었습니다'
    });
  } catch (error) {
    console.error('워드프레스 설정 저장 오류:', error.message);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다'
    });
  }
});

// --- Root Route ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// --- Cron Job for Scheduled Posts ---
console.log('서버에 크론 작업 설정 중...');

// 매시간 자동 포스팅 크론잡 (기본: 매 시간)
cron.schedule('0 * * * *', async () => {
  try {
    console.log('자동 포스팅 크론 작업 실행 중...');
    
    // 스케줄러 확인
    if (!scheduler.canPostNow()) {
      console.warn('포스팅 제한으로 인해 자동 포스팅을 건너뜁니다.');
      return;
    }
    
    // 키워드 가져오기
    const keyword = scheduler.getNextKeyword();
    if (!keyword) {
      console.error('자동 포스팅을 위한 키워드를 찾을 수 없습니다.');
      return;
    }
    
    console.log(`자동 포스팅 시작: 키워드=${keyword}`);
    
    // postRoutes.autoPost 직접 호출 (req, res 객체 없이)
    const postData = {
      keyword: keyword,
      imageStrategy: 'ai', // AI 이미지 사용
      contentStrategy: 'ai_only', // AI 콘텐츠만 사용
      targetPlatform: 'wordpress' // WordPress에 게시
    };
    
    // 직접 createPostLogic 함수 호출 (이 함수는 postRoutes에서 export 되어 있어야 함)
    const result = await postRoutes.createPostLogic(postData);
    
    if (result && result.success) {
      console.log(`자동 포스팅 성공: ${result.finalPostUrl || '(URL 없음)'}`);
    } else {
      console.error('자동 포스팅 실패', { result });
    }
  } catch (error) {
    console.error('자동 포스팅 크론 작업 중 오류 발생:', error.message, error.stack);
    await notifier.sendErrorNotification(
      '자동 포스팅 크론 작업 실패',
      { error: error.message, stack: error.stack }
    );
  }
});

// 전역 변수 노출
global.recordActivity = activitiesModule.recordActivity;

// --- Server Initialization ---
async function startServer() {
  try {
    console.log('서버 시작 중...');
    
    // MongoDB 연결 시도
    console.log('MongoDB 연결 초기화 중...');
    if (process.env.MONGODB_URI) {
      try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB 데이터베이스에 성공적으로 연결되었습니다.');
      } catch (dbError) {
        console.error('MongoDB 연결 실패:', dbError.message);
        console.log('MongoDB 없이 계속 진행합니다. 인증 관련 기능은 작동하지 않을 수 있습니다.');
      }
    } else {
      console.log('MONGODB_URI가 설정되지 않았습니다. MongoDB 없이 계속 진행합니다.');
      console.log('테스트를 위한 임시 MongoDB 서버를 사용하려면 다음 URI를 .env 파일에 추가하세요:');
      console.log('MONGODB_URI=mongodb://localhost:27017/auto-posting-service');
    }
    
    // uploads 디렉토리 확인
    const uploadsDir = path.join(__dirname, 'uploads');
    try {
      await fs.promises.access(uploadsDir);
      console.log(`uploads 디렉토리 확인 완료: ${uploadsDir}`);
    } catch (error) {
      console.log(`uploads 디렉토리 생성 중: ${uploadsDir}`);
      await fs.promises.mkdir(uploadsDir, { recursive: true });
    }
    
    // 스케줄러 초기화
    console.log('포스팅 스케줄러 초기화 중...');
    const schedulerInitialized = await scheduler.initialize();
    if (schedulerInitialized) {
      console.log('포스팅 스케줄러가 성공적으로 초기화되었습니다.');
    } else {
      console.warn('포스팅 스케줄러 초기화 실패, 기본 설정으로 진행합니다.');
    }
    
    // 이메일 알림 테스트 (옵션)
    if (process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true' && process.env.EMAIL_TEST_ON_STARTUP === 'true') {
      console.log('이메일 알림 시스템 테스트 중...');
      const emailSent = await notifier.sendInfoNotification(
        '서버 시작 알림',
        `<h2>자동 포스팅 서비스 서버가 시작되었습니다</h2>
         <p><strong>시간:</strong> ${new Date().toLocaleString()}</p>
         <p><strong>환경:</strong> ${process.env.NODE_ENV || 'development'}</p>`
      );
      
      if (emailSent) {
        console.log('이메일 알림 테스트 성공');
      } else {
        console.warn('이메일 알림 테스트 실패');
      }
    }
    
    // 서버 시작
    app.listen(PORT, () => {
      console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
      console.log(`관리자 대시보드: http://localhost:${PORT}/admin`);
      console.log('자동 포스팅 서비스가 준비되었습니다');
    });
  } catch (error) {
    console.error('서버 시작 중 오류 발생:', error.message, error.stack);
  }
}

// Start the server
startServer(); 