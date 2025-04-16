const fs = require('fs').promises;
const path = require('path');

class Scheduler {
  constructor() {
    this.config = {
      postingEnabled: true,
      postingInterval: 60, // minutes
      maxPostsPerDay: 24,
      keywordRotation: true,
      keywords: ['자동', '포스팅', '테스트']
    };
    this.lastPostTime = null;
    this.todayPostCount = 0;
    this.currentKeywordIndex = 0;
    this.configPath = path.join(process.cwd(), 'config.json');
    this.schedulesPath = path.join(process.cwd(), 'schedules.json');
  }

  async initialize() {
    try {
      // 설정 파일 로드 시도
      try {
        const configData = await fs.readFile(this.configPath, 'utf8');
        if (configData && configData.trim() !== '') {
          const parsedConfig = JSON.parse(configData);
          this.config = { ...this.config, ...parsedConfig };
          console.log('스케줄러 설정 파일을 성공적으로 로드했습니다.');
        }
      } catch (error) {
        console.warn('스케줄러 설정 파일을 로드할 수 없습니다. 기본 설정을 사용합니다:', error.message);
        // 기본 설정으로 config.json 파일 생성
        await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      }

      // 스케줄 파일 로드 시도
      try {
        const schedulesData = await fs.readFile(this.schedulesPath, 'utf8');
        if (schedulesData && schedulesData.trim() !== '') {
          const parsedSchedules = JSON.parse(schedulesData);
          
          // 스케줄 데이터에서 마지막 포스팅 시간과 오늘 포스팅 수 복원
          if (parsedSchedules.lastPostTime) {
            this.lastPostTime = new Date(parsedSchedules.lastPostTime);
          }
          
          // 오늘 날짜와 저장된 날짜 비교하여 카운터 리셋 여부 결정
          const today = new Date().toDateString();
          const savedDate = parsedSchedules.date;
          
          if (savedDate === today) {
            this.todayPostCount = parsedSchedules.todayPostCount || 0;
          } else {
            // 날짜가 다르면 카운터 리셋
            this.todayPostCount = 0;
          }
        }
      } catch (error) {
        console.warn('스케줄 데이터를 로드할 수 없습니다. 새 스케줄을 시작합니다:', error.message);
        // 기본 스케줄 데이터로 schedules.json 파일 생성
        const defaultSchedules = {
          date: new Date().toDateString(),
          lastPostTime: null,
          todayPostCount: 0
        };
        await fs.writeFile(this.schedulesPath, JSON.stringify(defaultSchedules, null, 2));
      }

      return true;
    } catch (error) {
      console.error('스케줄러 초기화 중 오류 발생:', error);
      return false;
    }
  }

  async updateConfig(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (error) {
      console.error('스케줄러 설정 업데이트 중 오류 발생:', error);
      return false;
    }
  }

  canPostNow() {
    // 테스트 모드: 항상 포스팅 허용 (개발/테스트 시에만 사용)
    const testMode = process.env.SCHEDULER_TEST_MODE === 'true';
    if (testMode) {
      console.log('스케줄러 테스트 모드: 포스팅 제한이 비활성화되었습니다.');
      return true;
    }

    // 포스팅이 비활성화되어 있는지 확인
    if (!this.config.postingEnabled) {
      return false;
    }

    // 하루 최대 포스팅 수를 초과했는지 확인
    if (this.todayPostCount >= this.config.maxPostsPerDay) {
      return false;
    }

    // 마지막 포스팅으로부터 충분한 시간이 지났는지 확인
    if (this.lastPostTime) {
      const now = new Date();
      const minutesSinceLastPost = (now - this.lastPostTime) / (1000 * 60);
      if (minutesSinceLastPost < this.config.postingInterval) {
        return false;
      }
    }

    return true;
  }

  async recordPost() {
    try {
      this.lastPostTime = new Date();
      this.todayPostCount++;

      // 날짜가 변경되었는지 확인
      const today = new Date().toDateString();
      let currentDate = today;

      // 스케줄 데이터 업데이트
      const scheduleData = {
        date: currentDate,
        lastPostTime: this.lastPostTime,
        todayPostCount: this.todayPostCount
      };

      await fs.writeFile(this.schedulesPath, JSON.stringify(scheduleData, null, 2));
      return true;
    } catch (error) {
      console.error('포스팅 기록 중 오류 발생:', error);
      return false;
    }
  }

  getNextKeyword() {
    if (!this.config.keywords || this.config.keywords.length === 0) {
      return null;
    }

    // 키워드 순환이 비활성화된 경우 첫 번째 키워드 사용
    if (!this.config.keywordRotation) {
      return this.config.keywords[0];
    }

    // 현재 키워드 가져오기
    const keyword = this.config.keywords[this.currentKeywordIndex];

    // 다음 키워드 인덱스로 이동
    this.currentKeywordIndex = (this.currentKeywordIndex + 1) % this.config.keywords.length;

    return keyword;
  }

  getConfig() {
    return this.config;
  }

  getStatus() {
    return {
      enabled: this.config.postingEnabled,
      interval: this.config.postingInterval,
      maxPostsPerDay: this.config.maxPostsPerDay,
      todayPostCount: this.todayPostCount,
      lastPostTime: this.lastPostTime,
      nextPostEligible: this.canPostNow(),
      keywords: this.config.keywords,
      currentKeywordIndex: this.currentKeywordIndex
    };
  }
}

const scheduler = new Scheduler();

module.exports = {
  scheduler
}; 