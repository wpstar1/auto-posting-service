const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const OpenAI = require('openai');
const axios = require('axios');
const cron = require('node-cron');
const mongoose = require('mongoose');

// OpenAI 초기화
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 콘텐츠 스타일별 프롬프트 정의
const CONTENT_STYLE_PROMPTS = {
    professional_guide: `너는 수익형 블로그 운영 경험이 많은 SEO 전문가이자 카피라이팅 마스터야.  
아래 키워드를 바탕으로 **구글 상위 1위에 오를 수 있는 블로그 포스팅**을 작성해줘.

---  
🔑 키워드: {keywords}
---  

💡 작성 조건:
1. **클릭 유도형 제목** 3가지 제안 → 실제 사용자 검색을 유도할 수 있는 스타일
2. **SEO 메타 설명 (120자 이내)** → 검색결과에 보이는 문장
3. **본문 구성**:
   - 도입: 문제 인식 + 공감 유도 (감정 자극)
   - 본문: 소제목 포함 (h2/h3), 키워드 반복 삽입 (자연스럽게)
   - Q&A 섹션 포함 (구글 People Also Ask 최적화)
   - 결론: 요약 + 행동 유도(Call To Action)

4. **LSI 키워드(연관 키워드)**도 함께 반영해서 자연스럽게 포함
5. **문장 길이 짧게, 1문단 2~3줄**로 가독성 있게 작성
6. **전문성과 신뢰성**을 보여줄 수 있는 구체적 정보/예시 포함
7. 스타일은 부드럽고 대화체, 너무 딱딱하지 않게`,

    story_experience: `너는 경험을 바탕으로 설득력 있게 글 쓰는 리뷰 전문 블로거야.  
아래 키워드를 주제로 **경험담 중심의 감성 후기형 포스팅**을 작성해줘.

- 키워드: {keywords}

작성 조건:
1. 실제 사용해본 듯한 생생한 경험담
2. 사용자 입장에서 느낀 장점/단점 포함
3. 감성적 + 대화체 문장 사용
4. 질문 & 공감 유도하는 문장 포함
5. 클릭 유도 제목 + 메타 설명 포함

출력:
- 제목:
- 메타 설명:
- 본문 (후기 스타일, 키워드 삽입)`,

    qa_format: `너는 블로그로 수익을 내는 SEO 전문가야.  
아래 키워드를 기반으로 **정확하고 신뢰성 있는 정보형 포스팅**을 작성해줘.

- 키워드: {keywords}

조건:
1. 구글 상위 랭킹 사이트 참고
2. 제목은 정보 전달 + 클릭 유도형
3. 소제목 포함 (h2), 키워드 반복 자연스럽게
4. 최신 정보 포함 + 간단한 팁, FAQ 포함
5. 읽기 쉬운 문장으로 구성 (한 문단 2~3줄)

형식:
- 제목:
- 메타 설명:
- 본문 (도입, 본문, Q&A, 결론 포함)`,

    trend_analysis: `너는 특정 제품/서비스 키워드로 SEO 상위 노출을 유도하는 콘텐츠 마케터야.  
아래 키워드로 **비교/분석 중심의 포스팅**을 작성해줘.

- 키워드: {keywords}

요구사항:
1. 경쟁 서비스/상품 3개 비교
2. 장단점 요약
3. 표 또는 리스트 사용 (가독성 ↑)
4. 키워드 포함된 소제목
5. 결론에서 "이런 사람에게 추천" 식으로 유도

형식:
- 제목:
- 본문 (비교 테이블, 추천/비추천 등 포함)`,

    how_to_guide: `너는 오랫동안 [키워드] 분야에서 활동한 실전 경험자야.  
아래 키워드에 대해 **실용적이고 실제 도움 되는 꿀팁 중심 글**을 작성해줘.

- 키워드: {keywords}

요구사항:
1. 초보자도 이해할 수 있는 쉬운 설명
2. 실수하지 않는 법, 유용한 팁, 실제 사례 포함
3. 소제목 포함 (Tip 1, Tip 2... 형식)
4. 친절하고 유쾌한 말투
5. 키워드 자연스럽게 반복

출력:
- 제목:
- 본문 (팁 형식으로 정리)`,

    comparison_review: `너는 특정 제품/서비스 키워드로 SEO 상위 노출을 유도하는 콘텐츠 마케터야.  
아래 키워드로 **비교/분석 중심의 포스팅**을 작성해줘.

- 키워드: {keywords}

요구사항:
1. 경쟁 서비스/상품 3개 비교
2. 장단점 요약
3. 표 또는 리스트 사용 (가독성 ↑)
4. 키워드 포함된 소제목
5. 결론에서 "이런 사람에게 추천" 식으로 유도

형식:
- 제목:
- 본문 (비교 테이블, 추천/비추천 등 포함)`
};

// 사용자 레벨 확인 유틸리티 함수
const getUserLevel = async (userId) => {
    try {
        const user = await mongoose.model('User').findById(userId);
        // 사용자가 vip level이고 membershipStatus가 active인 경우에만 VIP로 인정
        return user && user.level === 'vip' && user.membershipStatus === 'active' ? 'vip' : 'level1';
    } catch (error) {
        console.error('사용자 레벨 확인 오류:', error);
        return 'level1'; // 오류 발생 시 기본값 반환
    }
};

// 자동 포스팅 설정 저장
router.post('/config', protect, async (req, res) => {
    try {
        const { platformId, keywords, schedule, seo, images, contentStyle } = req.body;
        
        // 설정 유효성 검사
        if (!platformId || !keywords || !schedule || !contentStyle) {
            return res.status(400).json({
                success: false,
                message: '필수 설정이 누락되었습니다.'
            });
        }

        // 사용자의 자동 포스팅 설정 저장
        const config = await mongoose.model('AutoPostConfig').findOneAndUpdate(
            { userId: req.user.id },
            {
                platformId,
                keywords,
                schedule,
                seo,
                images,
                contentStyle,
                active: true
            },
            { upsert: true, new: true }
        );

        // 크론 작업 스케줄링
        setupCronJob(config);

        res.status(200).json({
            success: true,
            message: '자동 포스팅 설정이 저장되었습니다.'
        });
    } catch (error) {
        console.error('자동 포스팅 설정 저장 오류:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

// 자동 포스팅 설정 불러오기
router.get('/config', protect, async (req, res) => {
    try {
        const config = await mongoose.model('AutoPostConfig').findOne({ userId: req.user.id });
        res.status(200).json({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('자동 포스팅 설정 불러오기 오류:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

// 설정 저장
router.post('/settings', protect, async (req, res) => {
    try {
        const settings = req.body;
        
        // 임시로 메모리에 저장
        if (!global.autoPostSettings) {
            global.autoPostSettings = {};
        }
        
        global.autoPostSettings[req.user.id] = settings;
        
        res.json({ message: '설정이 저장되었습니다.' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ message: '설정 저장에 실패했습니다.' });
    }
});

// 설정 불러오기
router.get('/settings', protect, async (req, res) => {
    try {
        const settings = global.autoPostSettings?.[req.user.id] || {};
        res.json(settings);
    } catch (error) {
        console.error('Error loading settings:', error);
        res.status(500).json({ message: '설정을 불러오는데 실패했습니다.' });
    }
});

// 자동 포스팅 시작 라우트
router.post('/start', protect, async (req, res) => {
    try {
        const { platformId, keywords, contentStyle, settings, useInternalLinks, internalLinks, imageCount } = req.body;
        
        // 필수 필드 검증
        if (!platformId) {
            return res.status(400).json({
                success: false,
                message: '워드프레스 계정을 선택해주세요.'
            });
        }

        if (!keywords) {
            return res.status(400).json({
                success: false,
                message: '키워드를 입력해주세요.'
            });
        }

        // 계정 정보 확인
        const platform = await mongoose.model('Platform').findOne({
            _id: platformId,
            user: req.user.id
        }).select('+password +appKey');

        if (!platform) {
            return res.status(404).json({
                success: false,
                message: '선택한 워드프레스 계정을 찾을 수 없습니다.'
            });
        }
        
        // 사용자 레벨 확인 및 제한 적용
        const userLevel = await getUserLevel(req.user.id);
        let frequency = settings?.postingFrequency || 24;
        let minWordCount = settings?.minWordCount || 800;
        let imgCount = imageCount || 1;
        
        // Level 1 사용자 제한
        if (userLevel !== 'vip') {
            // 일반 사용자는 즉시 포스팅(하루 1회)만 가능
            if (frequency !== 'immediate' && frequency !== 24) {
                return res.status(403).json({
                    success: false,
                    message: '일반 회원은 즉시 포스팅(하루 1회)만 사용 가능합니다. VIP로 업그레이드하시면 더 다양한 포스팅 주기를 사용하실 수 있습니다.'
                });
            }
            
            // 포스팅 글자수 제한
            if (minWordCount > 800) {
                minWordCount = 800;
            }
            
            // 이미지 수 제한
            if (imgCount > 1) {
                imgCount = 1;
            }
            
            // frequency 값 강제 설정 (즉시 포스팅이면 24시간마다로 처리)
            frequency = 24;
        }
        
        // 랜덤 포스팅 주기 처리 (VIP 전용)
        const isRandom = frequency === 'random';
        if (isRandom) {
            if (userLevel !== 'vip') {
                return res.status(403).json({
                    success: false,
                    message: '랜덤 포스팅 기능은 VIP 회원 전용입니다.'
                });
            }
            // 랜덤 포스팅은 내부적으로 1~24 사이의 랜덤 값으로 처리
            frequency = Math.floor(Math.random() * 24) + 1;
        }

        // 자동 포스팅 설정 저장
        const config = {
            user: req.user.id,
            platform: platformId,
            contentStyle: contentStyle || 'professional_guide',
            keywords: keywords,
            frequency: frequency,
            keywordDensity: settings?.keywordDensity || 2.8,
            minWordCount: minWordCount,
            useInternalLinks: useInternalLinks || false,
            internalLinks: internalLinks || [],
            imageCount: imgCount,
            status: 'active'
        };

        // 데이터베이스에 설정 저장
        let autoPostConfig = await mongoose.model('AutoPostConfig').findOne({
            user: req.user.id,
            platform: platformId
        });

        if (autoPostConfig) {
            // 기존 설정 업데이트
            Object.assign(autoPostConfig, config);
        } else {
            // 새 설정 생성
            autoPostConfig = new (mongoose.model('AutoPostConfig'))(config);
        }

        await autoPostConfig.save();

        // 포스팅 즉시 실행 (비동기적으로)
        setTimeout(async () => {
            try {
                // 백그라운드에서 첫 포스팅 실행
                console.log(`사용자 ${req.user.id}의 자동 포스팅 시작: ${keywords}`);
                
                // 여기서 포스팅 생성 로직을 실행하거나 큐에 추가
                // 실제 구현은 워드프레스 API 연동 로직 필요
                
            } catch (error) {
                console.error('첫 자동 포스팅 중 오류:', error);
            }
        }, 100);

        // 성공 응답
        res.status(200).json({
            success: true,
            message: '자동 포스팅이 성공적으로 설정되었습니다.',
            config: {
                id: autoPostConfig._id,
                keywords: autoPostConfig.keywords,
                frequency: autoPostConfig.frequency,
                status: autoPostConfig.status,
                isRandom: isRandom // 랜덤 포스팅 여부 전달
            }
        });
        
    } catch (error) {
        console.error('자동 포스팅 설정 중 오류:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류: ' + (error.message || '알 수 없는 오류가 발생했습니다.')
        });
    }
});

// 자동 포스팅 실행
async function generateAndPost(config) {
    try {
        // 1. 선택된 스타일에 맞는 프롬프트 가져오기
        const prompt = CONTENT_STYLE_PROMPTS[config.contentStyle]
            .replace('{keywords}', config.keywords.join(', '));

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { 
                    role: "system", 
                    content: "당신은 수익형 블로그 운영 경험이 많은 SEO 전문가이자 카피라이팅 마스터입니다. 구글 SEO에 최적화된 고품질 콘텐츠를 생성하는 것이 특기입니다." 
                },
                { 
                    role: "user", 
                    content: prompt 
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        const content = completion.choices[0].message.content;

        // 2. 이미지 생성 또는 검색
        const images = [];
        const selectedSources = config.images.sources;
        
        for (let i = 0; i < config.images.count; i++) {
            // 랜덤하게 이미지 소스 선택
            const source = selectedSources[Math.floor(Math.random() * selectedSources.length)];
            let imageUrl;

            switch (source) {
                case 'unsplash':
                    const unsplashResponse = await axios.get(`https://api.unsplash.com/photos/random`, {
                        params: {
                            query: config.keywords[0],
                            orientation: 'landscape'
                        },
                        headers: {
                            Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
                        }
                    });
                    imageUrl = unsplashResponse.data.urls.regular;
                    break;

                case 'pexels':
                    const pexelsResponse = await axios.get(`https://api.pexels.com/v1/search`, {
                        params: {
                            query: config.keywords[0],
                            per_page: 1,
                            page: Math.floor(Math.random() * 10) + 1
                        },
                        headers: {
                            Authorization: process.env.PEXELS_API_KEY
                        }
                    });
                    imageUrl = pexelsResponse.data.photos[0].src.large;
                    break;

                case 'pixabay':
                    const pixabayResponse = await axios.get(`https://pixabay.com/api/`, {
                        params: {
                            key: process.env.PIXABAY_API_KEY,
                            q: config.keywords[0],
                            per_page: 1,
                            page: Math.floor(Math.random() * 10) + 1
                        }
                    });
                    imageUrl = pixabayResponse.data.hits[0].largeImageURL;
                    break;
            }

            // AI 이미지 분석이 활성화된 경우
            if (config.images.aiAnalysis) {
                // 이미지 관련성 분석 로직
                // ...
            }

            images.push(imageUrl);
        }

        // 3. 워드프레스에 포스팅
        const platform = await mongoose.model('Platform').findById(config.platformId);
        if (!platform) {
            throw new Error('워드프레스 계정을 찾을 수 없습니다.');
        }

        // 워드프레스 API로 포스트 작성
        const postData = {
            title: `${config.keywords[0]} 관련 최신 트렌드 및 인사이트`,
            content: content,
            status: 'publish',
            featured_media: images[0] // 첫 번째 이미지를 대표 이미지로 설정
        };

        await axios.post(`${platform.url}/wp-json/wp/v2/posts`, postData, {
            auth: {
                username: platform.username,
                password: platform.password
            }
        });

        console.log('자동 포스팅 완료:', config.keywords[0]);
    } catch (error) {
        console.error('자동 포스팅 실행 오류:', error);
    }
}

// 크론 작업 설정
function setupCronJob(config) {
    const cronSchedule = getCronSchedule(config.schedule);
    cron.schedule(cronSchedule, () => {
        generateAndPost(config);
    });
}

// 스케줄 설정을 크론 표현식으로 변환
function getCronSchedule(schedule) {
    const hour = schedule.time;
    
    switch (schedule.frequency) {
        case 'daily':
            return `0 ${hour} * * *`;
        case 'weekly':
            return `0 ${hour} * * 1`; // 매주 월요일
        case 'biweekly':
            return `0 ${hour} 1,15 * *`; // 매월 1일, 15일
        case 'monthly':
            return `0 ${hour} 1 * *`; // 매월 1일
        default:
            return `0 ${hour} * * *`; // 기본값: 매일
    }
}

// 즉시 포스팅 API 엔드포인트
router.post('/immediate', protect, async (req, res) => {
    try {
        const { platformId, keywords, contentStyle, useInternalLinks, internalLinks } = req.body;
        
        // 필수 필드 검증
        if (!platformId) {
            return res.status(400).json({
                success: false,
                message: '워드프레스 계정을 선택해주세요.'
            });
        }

        if (!keywords) {
            return res.status(400).json({
                success: false,
                message: '키워드를 입력해주세요.'
            });
        }

        // 계정 정보 확인
        const platform = await mongoose.model('Platform').findOne({
            _id: platformId,
            user: req.user.id
        }).select('+password +appKey');

        if (!platform) {
            return res.status(404).json({
                success: false,
                message: '선택한 워드프레스 계정을 찾을 수 없습니다.'
            });
        }
        
        // 포스팅 시작
        console.log(`[즉시 포스팅] 사용자 ${req.user.id}의 포스팅 시작: ${keywords}, 스타일: ${contentStyle || 'professional_guide'}`);
        
        // 포스팅 생성 및 게시 로직
        try {
            // 이 부분은 실제 블로그 포스팅 생성 로직
            // 1. OpenAI로 컨텐츠 생성
            let contentResult;
            try {
                contentResult = await generateContent({
                    keywords,
                    contentStyle: contentStyle || 'professional_guide',
                    minWordCount: 800, // 기본값
                    keywordDensity: 2.8,
                    useInternalLinks: useInternalLinks || false,
                    internalLinks: internalLinks || []
                });
                
                if (!contentResult.success) {
                    throw new Error(contentResult.error || '컨텐츠 생성 실패');
                }
            } catch (error) {
                console.error('컨텐츠 생성 중 오류:', error);
                return res.status(500).json({
                    success: false,
                    message: '포스팅 컨텐츠 생성 중 오류가 발생했습니다.'
                });
            }
            
            // 2. 워드프레스에 포스팅
            try {
                // 워드프레스 API를 통한 포스팅
                const wpResponse = await postToWordPress({
                    platform,
                    title: contentResult.title,
                    content: contentResult.content,
                    imageCount: 1 // 기본값
                });
                
                if (!wpResponse.success) {
                    throw new Error(wpResponse.error || '워드프레스 포스팅 실패');
                }
                
                // 포스팅 이력 기록
                // (이 부분은 포스팅 히스토리를 기록하는 로직 - 필요시 구현)
                
                // 성공 응답
                return res.status(200).json({
                    success: true,
                    message: '포스팅이 성공적으로 완료되었습니다.',
                    postUrl: wpResponse.postUrl
                });
                
            } catch (error) {
                console.error('워드프레스 포스팅 중 오류:', error);
                return res.status(500).json({
                    success: false,
                    message: '워드프레스 포스팅 중 오류가 발생했습니다: ' + error.message
                });
            }
            
        } catch (error) {
            console.error('즉시 포스팅 중 일반 오류:', error);
            return res.status(500).json({
                success: false,
                message: '포스팅 중 오류가 발생했습니다.'
            });
        }
        
    } catch (error) {
        console.error('즉시 포스팅 API 오류:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

// 랜덤 포스팅 타이밍 생성 함수
function generateRandomPostingSchedule(baseInterval, count) {
    const schedule = [];
    const now = new Date();
    let nextPostTime = new Date(now);
    
    for (let i = 0; i < count; i++) {
        // 기본 간격에 -20% ~ +20% 랜덤 변동 적용
        const variationPercent = Math.random() * 0.4 - 0.2; // -20% ~ +20% 
        const intervalVariation = baseInterval * (1 + variationPercent);
        
        // 다음 포스팅 시간 계산 (시간 단위를 밀리초로 변환)
        nextPostTime = new Date(nextPostTime.getTime() + intervalVariation * 3600 * 1000);
        
        // 포스팅 시간이 오전 1시 ~ 오전 5시인 경우 오전 9시로 조정
        const hours = nextPostTime.getHours();
        if (hours >= 1 && hours <= 5) {
            nextPostTime.setHours(9);
            nextPostTime.setMinutes(Math.floor(Math.random() * 60)); // 0~59분 랜덤
        }
        
        schedule.push(new Date(nextPostTime));
    }
    
    return schedule;
}

// 포스팅 예약 처리
router.post('/schedule', protect, async (req, res) => {
    try {
        const { platformId, frequency, postCount, keywords, imageCount, minWordCount, excludedWords } = req.body;
        
        // 사용자 레벨 확인
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
        
        const isVIP = user.level === 'vip' && user.membershipStatus === 'active';
        
        // 레벨 1 사용자가 VIP 기능 사용 시도 시 차단
        if (!isVIP && (frequency === 'random' || parseInt(imageCount) > 1 || minWordCount > 300)) {
            return res.status(403).json({
                success: false,
                message: 'VIP 회원만 사용 가능한 기능입니다. 멤버십 업그레이드를 고려해보세요.'
            });
        }
        
        // 플랫폼 검증
        const platform = await Platform.findOne({ _id: platformId, user: req.user.id });
        if (!platform) {
            return res.status(404).json({ success: false, message: '플랫폼을 찾을 수 없습니다.' });
        }
        
        // 일일 포스팅 한도 확인
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todayPostCount = await Post.countDocuments({
            user: req.user.id,
            createdAt: { $gte: today, $lt: tomorrow }
        });
        
        // 사용자 레벨별 일일 포스팅 한도
        const dailyLimit = isVIP ? 100 : 5;
        
        if (todayPostCount + parseInt(postCount) > dailyLimit) {
            return res.status(400).json({
                success: false,
                message: `일일 포스팅 한도(${dailyLimit}개)를 초과했습니다.`
            });
        }
        
        // 포스팅 일정 생성
        let postingSchedule;
        const parsedFrequency = parseInt(frequency);
        
        if (frequency === 'immediate') {
            // 즉시 포스팅은 현재 시간으로 하나만 예약
            postingSchedule = [new Date()];
        } else if (frequency === 'random' && isVIP) {
            // 랜덤 주기 설정 (VIP 전용)
            // 평균 주기는 8시간으로 설정하고, 실제로는 6.4~9.6시간 사이의 랜덤 간격으로 설정
            postingSchedule = generateRandomPostingSchedule(8, parseInt(postCount));
        } else if (!isNaN(parsedFrequency) && parsedFrequency >= 1 && parsedFrequency <= 24) {
            // 정해진 시간마다 포스팅
            postingSchedule = [];
            const now = new Date();
            let nextPostTime = new Date(now);
            
            for (let i = 0; i < parseInt(postCount); i++) {
                nextPostTime = new Date(nextPostTime.getTime() + parsedFrequency * 3600 * 1000);
                postingSchedule.push(new Date(nextPostTime));
            }
        } else {
            return res.status(400).json({
                success: false,
                message: '올바르지 않은 포스팅 주기입니다.'
            });
        }
        
        // 포스팅 스케줄 저장
        const keywordList = keywords.split(',').map(k => k.trim());
        
        const scheduledPosts = [];
        for (const scheduleTime of postingSchedule) {
            // 포스팅 예약 정보 저장
            const newPost = new Post({
                user: req.user.id,
                platform: platformId,
                scheduledFor: scheduleTime,
                status: 'scheduled',
                settings: {
                    keywords: keywordList,
                    imageCount: parseInt(imageCount),
                    minWordCount: parseInt(minWordCount),
                    excludedWords: excludedWords || ''
                }
            });
            
            await newPost.save();
            scheduledPosts.push(newPost);
        }
        
        // 활동 로그 기록
        await Activity.create({
            user: req.user.id,
            action: '포스팅 예약',
            details: `${scheduledPosts.length}개의 포스트가 예약되었습니다.`,
            timestamp: new Date()
        });
        
        res.status(201).json({
            success: true,
            message: `${scheduledPosts.length}개의 포스트가 예약되었습니다.`,
            scheduledPosts: scheduledPosts.map(post => ({
                id: post._id,
                scheduledFor: post.scheduledFor,
                status: post.status
            }))
        });
        
    } catch (error) {
        console.error('포스팅 예약 오류:', error);
        res.status(500).json({
            success: false,
            message: '포스팅 예약 중 오류가 발생했습니다.'
        });
    }
});

// 키워드에 맞는 랜덤 이미지 가져오기
async function getRandomImageForKeyword(keyword, userId) {
    try {
        // 몽구스 모델 가져오기
        const Image = mongoose.model('Image');
        
        // 키워드 기반으로 사용자 업로드 이미지 먼저 검색
        const userImages = await Image.findByKeyword(userId, keyword, 5);
        
        // 사용자 이미지가 있으면 랜덤하게 선택
        if (userImages && userImages.length > 0) {
            console.log(`사용자 이미지 찾음: ${userImages.length}개`);
            
            // 랜덤하게 이미지 선택
            const randomImage = userImages[Math.floor(Math.random() * userImages.length)];
            
            // 사용 횟수 증가
            await randomImage.incrementUsage();
            
            // 파일 경로로부터 URL 생성
            const relativePath = randomImage.path.split('uploads')[1]?.replace(/\\/g, '/');
            const imageUrl = relativePath ? `/uploads${relativePath}` : null;
            
            if (imageUrl) {
                console.log(`사용자 업로드 이미지 사용: ${imageUrl}`);
                return { url: imageUrl, isUserImage: true };
            }
        }
        
        // 검색 키워드 추출
        let searchKeyword = keyword.trim();
        
        // 키워드 분석 - 한글 키워드 카테고리 매핑
        const imageCategories = {
            '자연': ['숲', '바다', '산', '하늘', '꽃', '나무', '공원', '강', '폭포', '호수', '일몰', '해변'],
            '비즈니스': ['사무실', '회의', '협업', '노트북', '프레젠테이션', '팀워크', '비즈니스맨', '사업가'],
            '기술': ['컴퓨터', '코딩', '프로그래밍', '서버', '기술', 'IT', '소프트웨어', '하드웨어'],
            '교육': ['학교', '공부', '교육', '학습', '학생', '책', '도서관', '강의', '수업'],
            '음식': ['요리', '식당', '음식', '맛집', '레스토랑', '베이킹', '요리법', '디저트'],
            '건강': ['운동', '헬스', '건강', '웰빙', '요가', '필라테스', '명상', '다이어트'],
            '여행': ['여행', '관광', '휴가', '방문', '투어', '호텔', '리조트', '항공', '배낭여행'],
            '패션': ['의류', '패션', '스타일', '트렌드', '모델', '뷰티', '화장품', '헤어'],
            '스포츠': ['스포츠', '축구', '농구', '야구', '테니스', '골프', '수영', '경기', '선수'],
            '엔터테인먼트': ['영화', '음악', '공연', '드라마', '연예인', '콘서트', '페스티벌', '극장']
        };
        
        // 랜덤 이미지 스타일 적용 (VIP 전용)
        const imageStyles = [
            'painting', 'photographic', 'realistic', 'sketch', 'illustration', 
            'digital art', 'cartoon', 'oil painting', 'watercolor', 'abstract'
        ];
        
        // 키워드 카테고리 매칭
        let bestCategory = '';
        let highestScore = 0;
        
        for (const [category, categoryKeywords] of Object.entries(imageCategories)) {
            let score = 0;
            
            // 카테고리 키워드가 검색어에 포함되는지 확인
            for (const categoryKeyword of categoryKeywords) {
                if (searchKeyword.includes(categoryKeyword)) {
                    score++;
                    // 검색 키워드에서 카테고리 키워드 제거하여 중복 검색 방지
                    searchKeyword = searchKeyword.replace(categoryKeyword, '').trim();
                }
            }
            
            // 가장 높은 점수를 가진 카테고리 저장
            if (score > highestScore) {
                highestScore = score;
                bestCategory = category;
            }
        }
        
        // 최종 검색어 구성
        const finalSearchTerm = highestScore > 0 ? `${bestCategory},${searchKeyword}` : searchKeyword;
        
        // 랜덤 스타일 선택 (VIP 전용)
        const randomStyle = imageStyles[Math.floor(Math.random() * imageStyles.length)];
        const styleSearchTerm = finalSearchTerm + ` ${randomStyle}`;
        
        console.log(`외부 이미지 검색어: ${styleSearchTerm}`);
        
        // 무작위 이미지 소스 선택
        const imageSources = [
            'https://source.unsplash.com/1200x800/?',
            'https://loremflickr.com/1200/800/',
            'https://picsum.photos/1200/800/?query='
        ];
        
        // 랜덤하게 이미지 소스 선택
        const randomSource = imageSources[Math.floor(Math.random() * imageSources.length)];
        
        // 이미지 URL 구성
        let imageUrl = '';
        if (randomSource.includes('unsplash')) {
            imageUrl = `${randomSource}${encodeURIComponent(styleSearchTerm)}`;
        } else if (randomSource.includes('loremflickr')) {
            imageUrl = `${randomSource}${encodeURIComponent(styleSearchTerm)}`;
        } else {
            imageUrl = `${randomSource}${encodeURIComponent(styleSearchTerm)}`;
        }
        
        return { url: imageUrl, isUserImage: false };
    } catch (error) {
        console.error('이미지 검색 중 오류 발생:', error);
        // 오류 발생 시 기본 이미지 반환
        return { url: 'https://source.unsplash.com/1200x800/?nature', isUserImage: false };
    }
}

// 워드프레스에 포스팅하는 함수
async function postToWordPress({ platform, title, content, imageCount }) {
    try {
        // 워드프레스 API 엔드포인트
        const apiUrl = `${platform.url}/wp-json/wp/v2/posts`;
        
        // 비밀번호/앱키 복호화
        const decryptedPassword = platform.getDecryptedPassword();
        const decryptedAppKey = platform.getDecryptedAppKey();
        
        // 인증 정보
        const auth = Buffer.from(`${platform.username}:${decryptedAppKey || decryptedPassword}`).toString('base64');
        
        // 이미지 가져오기 및 업로드
        let featuredImageId = null;
        if (imageCount > 0) {
            try {
                // 이미지 URL 가져오기 (userId 파라미터 추가)
                const imageResult = await getRandomImageForKeyword(title, platform.userId);
                
                if (imageResult && imageResult.url) {
                    console.log('이미지 URL 가져옴:', imageResult.url);
                    
                    // 이미지 데이터 가져오기
                    const imageResponse = await axios.get(imageResult.url, { responseType: 'arraybuffer' });
                    const buffer = Buffer.from(imageResponse.data, 'binary');
                    
                    // 이미지 타입 확인
                    const imageType = imageResponse.headers['content-type'] || 'image/jpeg';
                    
                    // 워드프레스에 이미지 업로드
                    const mediaApiUrl = `${platform.url}/wp-json/wp/v2/media`;
                    
                    // 이미지 업로드
                    const mediaResponse = await axios.post(mediaApiUrl, buffer, {
                        headers: {
                            'Content-Type': imageType,
                            'Content-Disposition': `attachment; filename=${Date.now()}.jpg`,
                            'Authorization': `Basic ${auth}`
                        }
                    });
                    
                    // 업로드된 이미지 ID 저장
                    featuredImageId = mediaResponse.data.id;
                    console.log('이미지 업로드 성공, ID:', featuredImageId);
                }
            } catch (imageError) {
                console.error('이미지 업로드 오류:', imageError);
                // 이미지 업로드 실패해도 포스팅은 계속 진행
            }
        }
        
        // 포스팅 데이터
        const postData = {
            title: title,
            content: content,
            status: 'publish'
        };
        
        // 대표 이미지가 있으면 추가
        if (featuredImageId) {
            postData.featured_media = featuredImageId;
        }
        
        // 워드프레스 API 호출
        const response = await axios.post(apiUrl, postData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            }
        });
        
        // 성공 응답
        return {
            success: true,
            postId: response.data.id,
            postUrl: response.data.link
        };
        
    } catch (error) {
        console.error('워드프레스 API 오류:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

// OpenAI를 사용한 컨텐츠 생성 함수 (mock 버전)
async function generateContent({ keywords, contentStyle, minWordCount, keywordDensity, useInternalLinks, internalLinks }) {
    try {
        // 내부 링크 데이터 준비
        const internalLinksData = internalLinks && internalLinks.length > 0
            ? internalLinks
            : [
                { url: '/sample-page-1/', anchor: '관련 가이드' },
                { url: '/sample-page-2/', anchor: '자세한 정보' },
                { url: '/sample-page-3/', anchor: '전문가 팁' }
            ];
        
        // 링크를 삽입할 위치 결정 (본문의 중간 부분에 삽입)
        
        // 실제 OpenAI 통합을 대신할 목업 데이터
        const keywordString = Array.isArray(keywords) ? keywords.join(', ') : keywords;
        const title = `${keywordString}에 대한 완벽 가이드: 알아두면 유용한 정보`;
        
        // 기본 콘텐츠 생성
        let content = `
<h2>${keywordString}란 무엇인가?</h2>
<p>많은 사람들이 ${keywordString}에 대해 궁금해하지만, 정확한 정보를 찾기는 쉽지 않습니다. 이 글에서는 ${keywordString}에 대한 모든 것을 알려드립니다.</p>

<h2>${keywordString}의 주요 특징</h2>
<p>${keywordString}의 가장 중요한 특징은 다양성과 접근성입니다. 누구나 쉽게 시작할 수 있으며, 다양한 방식으로 활용할 수 있습니다.`;

        // 내부 링크 추가 (첫 번째 링크)
        if (useInternalLinks && internalLinksData.length > 0) {
            content += ` 좀 더 <a href="${internalLinksData[0].url}">${internalLinksData[0].anchor}</a>를 참조하시면 도움이 됩니다.`;
        }
        
        content += `</p>

<h2>왜 ${keywordString}가 중요한가?</h2>
<p>현대 사회에서 ${keywordString}의 중요성은 아무리 강조해도 지나치지 않습니다. ${keywordString}를 이해하고 활용하면 다양한 이점을 얻을 수 있습니다.`;

        // 내부 링크 추가 (두 번째 링크)
        if (useInternalLinks && internalLinksData.length > 1) {
            content += ` <a href="${internalLinksData[1].url}">${internalLinksData[1].anchor}</a>에서 더 많은 내용을 확인해보세요.`;
        }
        
        content += `</p>

<h2>${keywordString} 활용 방법</h2>
<p>효과적인 ${keywordString} 활용을 위한 몇 가지 팁을 소개합니다.`;

        // 내부 링크 추가 (세 번째 링크)
        if (useInternalLinks && internalLinksData.length > 2) {
            content += ` <a href="${internalLinksData[2].url}">${internalLinksData[2].anchor}</a>을 참고하시면 더 효과적으로 활용할 수 있습니다.`;
        }
        
        content += `</p>
<ul>
<li>항상 최신 정보를 확인하세요</li>
<li>전문가의 조언을 참고하세요</li>
<li>꾸준한 학습이 중요합니다</li>
<li>실제 적용 사례를 연구하세요</li>
</ul>

<h2>결론</h2>
<p>${keywordString}는 앞으로도 계속해서 발전할 것입니다. 이 글이 ${keywordString}에 대한 이해를 높이는 데 도움이 되었기를 바랍니다.</p>
`;
        
        return {
            success: true,
            title: title,
            content: content,
            wordCount: 200 // 실제로는 계산 필요
        };
        
    } catch (error) {
        console.error('컨텐츠 생성 오류:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = router;
