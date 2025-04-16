const express = require('express');
const path = require('path');
const { logger } = require('../utils/logger');
const { scheduler } = require('../utils/scheduler');
const { notifier } = require('../utils/notifier');

const router = express.Router();

// 관리자 대시보드 메인 페이지 제공
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

// 정적 관리자 파일 제공
router.use(express.static(path.join(__dirname, '..', 'admin')));

// 스케줄러 상태 API
router.get('/api/scheduler/status', (req, res) => {
  try {
    const status = scheduler.getStatus();
    res.json({ success: true, status });
  } catch (error) {
    logger.error('스케줄러 상태 조회 오류', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// 스케줄러 설정 업데이트 API
router.post('/api/scheduler/config', async (req, res) => {
  try {
    const newConfig = req.body;
    
    if (!newConfig) {
      return res.status(400).json({ success: false, error: '설정 데이터가 필요합니다' });
    }
    
    const updated = await scheduler.updateConfig(newConfig);
    
    if (updated) {
      res.json({ success: true, message: '스케줄러 설정이 업데이트되었습니다', config: scheduler.getConfig() });
    } else {
      res.status(500).json({ success: false, error: '스케줄러 설정 업데이트 실패' });
    }
  } catch (error) {
    logger.error('스케줄러 설정 업데이트 오류', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// 로그 파일 목록 API
router.get('/api/logs/list', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const logsDir = path.join(__dirname, '..', 'logs');
    
    const files = await fs.readdir(logsDir);
    const logFiles = files.filter(file => file.endsWith('.log'));
    
    const logFileStats = await Promise.all(
      logFiles.map(async (file) => {
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime
        };
      })
    );
    
    res.json({ success: true, logs: logFileStats });
  } catch (error) {
    logger.error('로그 파일 목록 조회 오류', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// 로그 파일 내용 API
router.get('/api/logs/content/:filename', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const filename = req.params.filename;
    
    if (!filename || !filename.endsWith('.log')) {
      return res.status(400).json({ success: false, error: '유효한 로그 파일 이름이 필요합니다' });
    }
    
    const logPath = path.join(__dirname, '..', 'logs', filename);
    
    try {
      const content = await fs.readFile(logPath, 'utf8');
      res.json({ success: true, content });
    } catch (readError) {
      res.status(404).json({ success: false, error: '로그 파일을 읽을 수 없습니다' });
    }
  } catch (error) {
    logger.error('로그 파일 내용 조회 오류', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// 테스트 이메일 발송 API
router.post('/api/test/email', async (req, res) => {
  try {
    if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'true') {
      return res.status(400).json({ success: false, error: '이메일 알림이 비활성화되어 있습니다' });
    }
    
    const emailSent = await notifier.sendInfoNotification(
      '테스트 이메일',
      `<h2>테스트 이메일</h2>
       <p>이것은 자동 포스팅 서비스의 테스트 이메일입니다.</p>
       <p><strong>시간:</strong> ${new Date().toLocaleString()}</p>`
    );
    
    if (emailSent) {
      res.json({ success: true, message: '테스트 이메일이 성공적으로 전송되었습니다' });
    } else {
      res.status(500).json({ success: false, error: '테스트 이메일 전송 실패' });
    }
  } catch (error) {
    logger.error('테스트 이메일 전송 오류', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router; 