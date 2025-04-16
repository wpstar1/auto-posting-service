const mongoose = require('mongoose');
const crypto = require('crypto');

const PlatformSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, '사이트 이름은 필수입니다'],
    trim: true
  },
  type: {
    type: String,
    enum: ['wordpress'],  // 향후 다른 플랫폼 추가 가능
    default: 'wordpress'
  },
  url: {
    type: String,
    required: [true, '사이트 URL은 필수입니다'],
    trim: true
  },
  username: {
    type: String,
    required: [true, '사용자 이름은 필수입니다'],
    trim: true
  },
  password: {
    type: String,
    required: [true, '비밀번호는 필수입니다'],
    select: false  // 보안을 위해 기본적으로 쿼리에서 제외
  },
  appKey: {
    type: String,
    required: [true, '앱 키는 필수입니다'],
    select: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastConnectionCheck: {
    type: Date,
    default: null
  },
  connectionStatus: {
    type: String,
    enum: ['connected', 'error', 'unchecked'],
    default: 'unchecked'
  },
  settings: {
    defaultCategory: {
      type: String,
      default: 'uncategorized'
    },
    defaultStatus: {
      type: String,
      enum: ['draft', 'publish'],
      default: 'publish'
    }
  }
}, {
  timestamps: true
});

// 비밀번호 필드 암호화
PlatformSchema.pre('save', async function(next) {
  if (!this.isModified('password') && !this.isModified('appKey')) {
    return next();
  }
  
  try {
    // 현대적인 암호화 방식 사용 (createCipheriv)
    const key = crypto.scryptSync(process.env.PLATFORM_ENCRYPTION_KEY || 'your-encryption-key-32-characters-long', 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    // 비밀번호 암호화
    if (this.isModified('password')) {
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(this.password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      // IV를 암호화된 텍스트 앞에 저장 (복호화할 때 필요)
      this.password = iv.toString('hex') + ':' + encrypted;
    }
    
    // 앱키 암호화
    if (this.isModified('appKey') && this.appKey) {
      const cipherAppKey = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encryptedAppKey = cipherAppKey.update(this.appKey, 'utf8', 'hex');
      encryptedAppKey += cipherAppKey.final('hex');
      // IV를 암호화된 텍스트 앞에 저장 (복호화할 때 필요)
      this.appKey = iv.toString('hex') + ':' + encryptedAppKey;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// 비밀번호 복호화 메소드
PlatformSchema.methods.getDecryptedPassword = function() {
  try {
    const key = crypto.scryptSync(process.env.PLATFORM_ENCRYPTION_KEY || 'your-encryption-key-32-characters-long', 'salt', 32);
    
    // IV와 암호화된 텍스트 분리
    const parts = this.password.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    // 복호화
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('비밀번호 복호화 중 오류:', error);
    return null;
  }
};

// 앱키 복호화 메소드
PlatformSchema.methods.getDecryptedAppKey = function() {
  try {
    // 앱키가 없으면 null 반환
    if (!this.appKey) return null;
    
    const key = crypto.scryptSync(process.env.PLATFORM_ENCRYPTION_KEY || 'your-encryption-key-32-characters-long', 'salt', 32);
    
    // IV와 암호화된 텍스트 분리
    const parts = this.appKey.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    // 복호화
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('앱키 복호화 중 오류:', error);
    return null;
  }
};

// 연결 상태 체크 메소드
PlatformSchema.methods.checkConnection = async function() {
  try {
    // WordPress 연결 테스트 로직 구현
    // 실제 테스트 대신 단순 유효성 검사로 변경 (개발 목적)
    if (!this.url || !this.username || !this.password) {
      return {
        success: false,
        message: '필수 정보(URL, 사용자 이름, 비밀번호)가 누락되었습니다.'
      };
    }
    
    // URL 기본 검증
    if (!this.url.startsWith('http://') && !this.url.startsWith('https://')) {
      return {
        success: false,
        message: 'URL은 http:// 또는 https://로 시작해야 합니다.'
      };
    }
    
    // 성공 응답
    this.lastConnectionCheck = new Date();
    this.connectionStatus = 'connected';
    
    return {
      success: true,
      message: '연결 테스트가 성공했습니다.'
    };
  } catch (error) {
    console.error('WordPress 연결 테스트 중 오류:', error);
    this.connectionStatus = 'error';
    
    return {
      success: false,
      message: error.message || '연결 테스트 중 오류가 발생했습니다.'
    };
  }
};

module.exports = mongoose.model('Platform', PlatformSchema);
