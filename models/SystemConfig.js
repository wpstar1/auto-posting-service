const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
  level1: {
    dailyPostLimit: {
      type: Number,
      default: 3,
      min: 1
    },
    maxPlatforms: {
      type: Number,
      default: 1
    },
    features: {
      type: [String],
      default: ['instantPosting']
    }
  },
  vip: {
    features: {
      type: [String],
      default: [
        'instantPosting',
        'scheduledPosting',
        'multiPlatform',
        'imageLibrary',
        'advancedSettings'
      ]
    }
  },
  system: {
    version: {
      type: String,
      default: '1.0.0'
    }
  }
}, {
  timestamps: true
});

// 싱글톤 패턴 구현
SystemConfigSchema.statics.getInstance = async function() {
  let config = await this.findOne();
  
  if (!config) {
    config = await this.create({});  // 기본값으로 생성
  }
  
  return config;
};

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);
