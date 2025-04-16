const { verifyToken, getUserById } = require('../config/auth');
const { logger } = require('../utils/logger');

/**
 * JWT를 통한 인증 미들웨어
 */
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Authorization 헤더에서 토큰 추출
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // 쿠키에서 토큰 추출
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    
    // 토큰이 없는 경우
    if (!token) {
      return res.status(401).json({
        success: false,
        error: '이 리소스에 접근하려면 로그인이 필요합니다'
      });
    }
    
    try {
      // 토큰 검증
      const decoded = verifyToken(token);
      
      // 사용자 정보 가져오기
      const user = await getUserById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: '이 토큰에 해당하는 사용자가 존재하지 않습니다'
        });
      }
      
      // 요청 객체에 사용자 정보 추가
      req.user = user;
      next();
    } catch (error) {
      logger.error('인증 실패:', error.message);
      return res.status(401).json({
        success: false,
        error: '인증에 실패했습니다. 다시 로그인해주세요'
      });
    }
  } catch (error) {
    logger.error('인증 미들웨어 오류:', error.message);
    return res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
};

/**
 * 특정 역할만 접근 가능하도록 하는 미들웨어
 * @param {...string} roles - 허용할 역할들
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: '인증되지 않은 사용자입니다'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: '이 리소스에 접근할 권한이 없습니다'
      });
    }
    
    next();
  };
}; 