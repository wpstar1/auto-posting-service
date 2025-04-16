const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 로그 디렉토리 확인 또는 생성
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 윈스턴 로거 설정
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'auto-posting-service' },
  transports: [
    // 콘솔에 로그 출력
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // 파일에 로그 저장
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log') 
    })
  ]
});

// 간단한 로그 래퍼 함수
function logInfo(message, meta = {}) {
  logger.info(message, meta);
}

function logError(message, error = null) {
  if (error) {
    logger.error(`${message}: ${error.message}`, { 
      error: error.message, 
      stack: error.stack 
    });
  } else {
    logger.error(message);
  }
}

function logWarn(message, meta = {}) {
  logger.warn(message, meta);
}

function logDebug(message, meta = {}) {
  logger.debug(message, meta);
}

module.exports = {
  logger,
  logInfo,
  logError,
  logWarn,
  logDebug
}; 