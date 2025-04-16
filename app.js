const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const scheduler = require('./services/scheduler');

const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'client')));

// 라우트
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/images', require('./routes/images'));
app.use('/api/platforms', require('./routes/platforms'));
app.use('/api/settings', require('./routes/settings'));
const qnaRouter = require('./routes/qna');
const supportRouter = require('./routes/support');
app.use('/api/qna', qnaRouter);
app.use('/api/support', supportRouter);
const autoPostRouter = require('./routes/auto-post');
app.use('/api/auto-post', autoPostRouter);

// 클라이언트 라우트 - SPA 지원
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '요청한 리소스를 찾을 수 없습니다'
  });
});

// 에러 처리
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: '서버 오류가 발생했습니다'
  });
});

// MongoDB 연결
mongoose.connect('mongodb://localhost:27017/auto-posting', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('MongoDB 연결 성공');
  
  // 포스팅 스케줄러 시작
  scheduler.start();
  
  // 서버 시작
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`서버가 ${PORT}번 포트에서 실행 중입니다`);
  });
})
.catch(err => {
  console.error('MongoDB 연결 실패:', err);
  process.exit(1);
});

// 종료 시 스케줄러 정지
process.on('SIGTERM', () => {
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  scheduler.stop();
  process.exit(0);
});

module.exports = app;
