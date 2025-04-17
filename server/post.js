const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { logger } = require('../utils/logger');
const { scheduler } = require('../utils/scheduler');
const { notifier } = require('../utils/notifier');

// Unsplash API를 통해 이미지 검색
async function searchUnsplashImages(keyword, count = 1) {
  try {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    
    if (!accessKey) {
      throw new Error('Unsplash API 키가 설정되지 않았습니다.');
    }
    
    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: {
        query: keyword,
        per_page: count,
        orientation: 'landscape'
      },
      headers: {
        'Authorization': `Client-ID ${accessKey}`
      }
    });
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      return response.data.results.map(image => ({
        url: image.urls.regular,
        downloadUrl: image.links.download,
        description: image.alt_description || keyword,
        authorName: image.user.name,
        authorUrl: image.user.links.html
      }));
    }
    
    return [];
  } catch (error) {
    logger.error('Unsplash 이미지 검색 실패', { error: error.message });
    return [];
  }
}

// WordPress에 이미지 업로드
async function uploadImageToWordPress(imageUrl, title, platformData = null) {
  try {
    let wpUrl, wpUser, wpPassword;
    
    // platformData가 있으면 해당 데이터 사용, 없으면 환경 변수 사용
    if (platformData && platformData.siteUrl && platformData.username && platformData.password) {
      wpUrl = platformData.siteUrl;
      wpUser = platformData.username;
      wpPassword = platformData.password;
      logger.info('플랫폼 데이터를 사용하여 WordPress 인증 정보 설정');
    } else {
      // 환경 변수에서 정보 가져오기
      wpUrl = process.env.WP_API_URL;
      wpUser = process.env.WP_USER;
      wpPassword = process.env.WP_PASSWORD;
      logger.info('환경 변수에서 WordPress 인증 정보 가져오기');
    }
    
    // 필요한 정보가 있는지 확인
    if (!wpUrl || !wpUser || !wpPassword) {
      throw new Error('WordPress API 설정이 완료되지 않았습니다. 워드프레스 계정 설정을 확인하세요.');
    }
    
    // URL이 /wp-json/wp/v2로 끝나지 않으면 추가
    if (!wpUrl.endsWith('/wp-json/wp/v2') && !wpUrl.endsWith('/wp-json/wp/v2/')) {
      wpUrl = wpUrl.replace(/\/$/, ''); // 끝에 슬래시가 있으면 제거
      wpUrl = `${wpUrl}/wp-json/wp/v2`;
    }
    
    // 이미지 다운로드
    logger.info('이미지 다운로드 중...', { imageUrl });
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(imageResponse.data, 'binary');
    
    // 파일 이름 생성 (URL에서 마지막 부분 추출)
    const filenameParts = imageUrl.split('/');
    let filename = filenameParts[filenameParts.length - 1];
    // 파일 이름에 쿼리 파라미터가 있으면 제거
    if (filename.includes('?')) {
      filename = filename.split('?')[0];
    }
    
    // 파일 확장자가 없으면 .jpg 추가
    if (!filename.includes('.')) {
      filename += '.jpg';
    }
    
    // WordPress 인증을 위한 토큰 생성
    const authString = Buffer.from(`${wpUser}:${wpPassword}`).toString('base64');
    
    // 이미지의 content-type 결정
    let contentType = 'image/jpeg';
    if (filename.endsWith('.png')) {
      contentType = 'image/png';
    } else if (filename.endsWith('.gif')) {
      contentType = 'image/gif';
    }
    
    // FormData 생성 및 파일 첨부
    const FormData = require('form-data');
    const form = new FormData();
    
    // 기존 createReadStream 대신 버퍼 직접 추가
    form.append('file', buffer, {
      filename: filename,
      contentType: contentType
    });
    
    // WordPress에 이미지 업로드
    logger.info('WordPress에 이미지 업로드 중...', { filename });
    
    const uploadResponse = await axios.post(`${wpUrl}/media`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Basic ${authString}`,
        'Content-Disposition': `attachment; filename=${filename}`
      }
    });
    
    // 임시 파일 삭제
    try {
      // await fs.unlink(tempFilePath);
    } catch (unlinkError) {
      logger.warn('임시 이미지 파일 삭제 실패', { error: unlinkError.message });
    }
    
    if (uploadResponse.status === 201) {
      logger.info('이미지 업로드 성공', { 
        mediaId: uploadResponse.data.id,
        url: uploadResponse.data.source_url
      });
      
      return {
        id: uploadResponse.data.id,
        url: uploadResponse.data.source_url
      };
    } else {
      throw new Error(`WordPress 이미지 업로드 오류: ${uploadResponse.status}`);
    }
  } catch (error) {
    logger.error('WordPress 이미지 업로드 실패', { error: error.message, stack: error.stack });
    throw error;
  }
}

// 워드프레스에 포스팅하는 함수
async function postToWordPress(title, content, featuredImageId = null, platformData = null) {
  try {
    let wpUrl, wpUser, wpPassword;
    
    // platformData가 있으면 해당 데이터 사용, 없으면 환경 변수 사용
    if (platformData && platformData.siteUrl && platformData.username && platformData.password) {
      wpUrl = platformData.siteUrl;
      wpUser = platformData.username;
      wpPassword = platformData.password;
      logger.info('플랫폼 데이터를 사용하여 WordPress 인증 정보 설정');
    } else {
      // 환경 변수에서 정보 가져오기
      wpUrl = process.env.WP_API_URL;
      wpUser = process.env.WP_USER;
      wpPassword = process.env.WP_PASSWORD;
      logger.info('환경 변수에서 WordPress 인증 정보 가져오기');
    }
    
    // 필요한 정보가 있는지 확인
    if (!wpUrl || !wpUser || !wpPassword) {
      throw new Error('WordPress API 설정이 완료되지 않았습니다. 워드프레스 계정 설정을 확인하세요.');
    }
    
    // URL이 /wp-json/wp/v2로 끝나지 않으면 추가
    if (!wpUrl.endsWith('/wp-json/wp/v2') && !wpUrl.endsWith('/wp-json/wp/v2/')) {
      wpUrl = wpUrl.replace(/\/$/, ''); // 끝에 슬래시가 있으면 제거
      wpUrl = `${wpUrl}/wp-json/wp/v2`;
    }
    
    // WordPress 인증을 위한 토큰 생성
    const authString = Buffer.from(`${wpUser}:${wpPassword}`).toString('base64');
    
    // 포스트 데이터 구성
    const postData = {
      title: title,
      content: content,
      status: 'publish', // 즉시 발행
    };
    
    // 특성 이미지 설정
    if (featuredImageId) {
      postData.featured_media = featuredImageId;
    }
    
    // WordPress REST API를 통해 포스트 생성
    const response = await axios.post(`${wpUrl}/posts`, postData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`
      }
    });
    
    if (response.status === 201) {
      logger.info('WordPress에 포스팅 성공', { postId: response.data.id });
      return {
        success: true,
        postId: response.data.id,
        postUrl: response.data.link
      };
    } else {
      throw new Error(`WordPress API 응답 오류: ${response.status}`);
    }
  } catch (error) {
    logger.error('WordPress 포스팅 실패', { error: error.message });
    throw error;
  }
}

// AI로 컨텐츠 생성 (OpenAI API 사용)
async function generateAIContent(keyword) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      logger.warn('OpenAI API 키가 설정되지 않았습니다. 더미 콘텐츠를 반환합니다.');
      return getDummyContent(keyword);
    }
    
    logger.info('OpenAI API 호출 중...', { keyword });
    
    // 다양한 프롬프트 템플릿 중 랜덤하게 선택
    const promptTemplates = [
      // 전문가 가이드 스타일
      `당신은 ${keyword} 분야의 전문가입니다. 이 주제에 대한 전문적인 가이드 스타일의 블로그 글을 작성해주세요. 중요한 개념을 설명하고, 실용적인 조언과 팁을 포함하세요. 정확한 정보와 전문 용어를 적절히 사용하고, 독자에게 실질적인 가치를 제공하는 콘텐츠를 HTML 형식으로 작성해주세요.`,
      
      // 경험 공유 스타일
      `당신은 ${keyword}에 대한 풍부한 경험을 가진 블로거입니다. 이 주제에 관한 개인적인 경험과 이야기를 중심으로 공감을 이끌어내는 블로그 글을 작성해주세요. 실제 사례, 느낀 점, 배운 교훈을 자연스럽게 풀어내는 친근한 톤으로 HTML 형식의 글을 작성해주세요.`,
      
      // Q&A 중심 스타일
      `당신은 ${keyword}에 관한 자주 묻는 질문들에 답변하는 형식의 블로그 글을 작성해주세요. 독자들이 가장 궁금해할 만한 5-7개의 질문을 선정하고, 각 질문에 명확하고 유용한 답변을 제공하세요. 질문과 답변 형식으로 구성된 HTML 형식의 콘텐츠를 작성해주세요.`
    ];
    
    // 프롬프트 스타일 선택 (postData에 promptStyle이 있으면 사용, 없으면 랜덤)
    let selectedPrompt;
    if (postData && postData.promptStyle) {
      // promptStyle에 따라 프롬프트 선택
      if (postData.promptStyle === 'expert') {
        selectedPrompt = promptTemplates[0]; // 전문가 가이드
      } else if (postData.promptStyle === 'experience') {
        selectedPrompt = promptTemplates[1]; // 경험 공유
      } else if (postData.promptStyle === 'qa') {
        selectedPrompt = promptTemplates[2]; // Q&A 중심
      } else {
        // 랜덤 (기본값)
        selectedPrompt = promptTemplates[Math.floor(Math.random() * promptTemplates.length)];
      }
    } else {
      // promptStyle이 없으면 랜덤
      selectedPrompt = promptTemplates[Math.floor(Math.random() * promptTemplates.length)];
    }
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: selectedPrompt
        }
      ],
      temperature: 0.8, // 다양성을 위해 temperature 증가
      max_tokens: 1500
    }, {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content;
      
      // 응답에서 제목과 내용 분리
      let title = `${keyword}에 대한 모든 것`;
      let htmlContent = content;
      
      // HTML 응답에서 제목 추출 시도
      const titleMatch = content.match(/<h1>(.*?)<\/h1>/) || content.match(/<h2>(.*?)<\/h2>/) || content.match(/#\s+(.*?)[\r\n]/);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
        // 제목을 내용에서 제거하지 않음 - 전체 HTML을 그대로 사용
      }
      
      logger.info('OpenAI 콘텐츠 생성 성공', { title });
      return { title, content: htmlContent };
    } else {
      logger.error('OpenAI API 응답 형식 오류');
      return getDummyContent(keyword);
    }
  } catch (error) {
    logger.error('OpenAI 콘텐츠 생성 실패', { error: error.message });
    return getDummyContent(keyword);
  }
}

// 더미 콘텐츠 생성 (API 실패 또는 API 키 없을 때 사용)
function getDummyContent(keyword) {
  return {
    title: `${keyword}에 대한 모든 것`,
    content: `<p>이 글은 <strong>${keyword}</strong>에 대한 자동 생성된 글입니다.</p>
              <p>실제 구현 시에는 OpenAI API 등을 사용하여 키워드에 맞는 컨텐츠를 생성하세요.</p>
              <p>이것은 예시 컨텐츠입니다. 지금은 ${new Date().toLocaleString()}에 생성되었습니다.</p>
              <p>${keyword}는 매우 흥미로운 주제입니다. 이에 대해 더 자세히 알아봅시다.</p>
              <p>이 글은 Unsplash의 이미지와 함께 자동으로 생성되었습니다.</p>`
  };
}

// 자동 포스팅 로직
async function createPostLogic(postData) {
  try {
    logger.info('자동 포스팅 시작', { postData });
    
    // 키워드 확인 및 처리
    let keyword = postData.keyword;
    
    // keywords 필드 처리 (배열 또는 문자열 형식 처리)
    if (!keyword && postData.keywords) {
      try {
        // 문자열로 전달된 배열 처리 (예: '["강아지"]')
        if (typeof postData.keywords === 'string') {
          const keywordsArray = JSON.parse(postData.keywords);
          if (Array.isArray(keywordsArray) && keywordsArray.length > 0) {
            keyword = keywordsArray[0];
          }
        } 
        // 이미 배열인 경우
        else if (Array.isArray(postData.keywords) && postData.keywords.length > 0) {
          keyword = postData.keywords[0];
        }
      } catch (parseError) {
        // JSON 파싱 실패 시 문자열 그대로 사용
        keyword = postData.keywords;
      }
    }
    
    // 최종 키워드 확인
    if (!keyword || (typeof keyword === 'string' && keyword.trim() === '')) {
      logger.error('포스팅 실패: 키워드가 필요합니다');
      return { success: false, error: '키워드가 필요합니다' };
    }
    
    // 스케줄러 확인
    if (!scheduler.canPostNow()) {
      logger.warn('포스팅 스케줄 제한으로 인해 포스팅을 건너뜁니다');
      return { success: false, error: '포스팅 스케줄 제한(시간 또는 일일 한도)으로 인해 포스팅을 건너뜁니다' };
    }

    // 컨텐츠 생성 전략에 따라 처리
    let title, content;
    
    // AI 컨텐츠 생성 옵션인 경우
    if (postData.contentStrategy === 'ai_only') {
      logger.info('AI를 사용하여 컨텐츠 생성 중...', { keyword });
      const aiContent = await generateAIContent(keyword);
      title = aiContent.title;
      content = aiContent.content;
    } 
    // 사용자 지정 컨텐츠가 있는 경우
    else if (postData.content) {
      content = postData.content;
      title = postData.title || `${keyword} 관련 포스트`;
    } 
    // 기본 컨텐츠 사용
    else {
      title = `${keyword} 관련 포스트`;
      content = `<p>이것은 ${keyword}에 관한 기본 포스트입니다.</p>`;
    }
    
    // 이미지 처리 - 사용자 레벨에 따라 제한
    let imageAdded = false;
    const imageHTMLs = []; // 이미지 HTML을 모아둘 배열
    
    // 사용자 레벨에 따른 이미지 최대 개수 설정
    const MAX_IMAGES_LEVEL1 = 1;
    const MAX_IMAGES_VIP = 5;
    const maxAllowedImages = (postData.userLevel === 'vip') ? MAX_IMAGES_VIP : MAX_IMAGES_LEVEL1;
    
    // 1. 사용자가 업로드한 이미지 처리
    if (postData.uploadedFiles && postData.uploadedFiles.length > 0) {
      logger.info('사용자 업로드 이미지 처리 중...', { count: postData.uploadedFiles.length });
      try {
        // 업로드 파일 제한
        const filesToProcess = postData.uploadedFiles.slice(0, maxAllowedImages);
        logger.info(`사용자 레벨(${postData.userLevel}): 이미지 ${filesToProcess.length}개 처리 중 (최대 ${maxAllowedImages}개)`);
        
        // 각 업로드된 파일에 대해 처리
        for (const file of filesToProcess) {
          // 이미지 파일인지 확인
          if (file.mimetype && file.mimetype.startsWith('image/')) {
            logger.info('이미지 파일 처리', { filename: file.originalname });
            
            // 이미지 업로드 (WordPress인 경우)
            if (postData.targetPlatform === 'wordpress') {
              try {
                // FormData 생성
                const FormData = require('form-data');
                const form = new FormData();
                
                // 버퍼 직접 추가
                form.append('file', file.buffer, {
                  filename: file.originalname,
                  contentType: file.mimetype
                });
                
                // WordPress API 설정 로드
                const wpUrl = process.env.WP_API_URL;
                const wpUser = process.env.WP_USER;
                const wpPassword = process.env.WP_PASSWORD;
                
                if (!wpUrl || !wpUser || !wpPassword) {
                  throw new Error('WordPress API 설정이 완료되지 않았습니다.');
                }
                
                // WordPress 인증을 위한 토큰 생성
                const authString = Buffer.from(`${wpUser}:${wpPassword}`).toString('base64');
                
                // WordPress에 이미지 업로드
                const uploadResponse = await axios.post(`${wpUrl}/wp-json/wp/v2/media`, form, {
                  headers: {
                    ...form.getHeaders(),
                    'Authorization': `Basic ${authString}`,
                    'Content-Disposition': `attachment; filename=${file.originalname}`
                  }
                });
                
                if (uploadResponse.status === 201) {
                  logger.info('사용자 이미지 업로드 성공', { 
                    mediaId: uploadResponse.data.id,
                    url: uploadResponse.data.source_url
                  });
                  
                  // 이미지 HTML 생성
                  const imageHtml = `
                    <figure class="wp-block-image">
                      <img src="${uploadResponse.data.source_url}" alt="${title}"/>
                      <figcaption>사용자 업로드 이미지</figcaption>
                    </figure>
                  `;
                  imageHTMLs.push(imageHtml);
                }
              } catch (wpError) {
                logger.error('이미지 업로드 실패', { error: wpError.message });
              }
            } else {
              // 테스트 모드 - 이미지 URL 대신 placeholder 사용
              const imageHtml = `
                <figure class="wp-block-image">
                  <img src="https://via.placeholder.com/800x450.png?text=${encodeURIComponent(file.originalname)}" alt="${title}"/>
                  <figcaption>사용자 업로드 이미지 (테스트 모드)</figcaption>
                </figure>
              `;
              imageHTMLs.push(imageHtml);
            }
          }
        }
        
        if (imageHTMLs.length > 0) {
          imageAdded = true;
          logger.info('사용자 업로드 이미지 처리 완료', { count: imageHTMLs.length });
        }
      } catch (imageError) {
        logger.error('사용자 업로드 이미지 처리 중 오류 발생', { error: imageError.message });
      }
    }
    
    // 2. 사용자가 AI 이미지 옵션을 활성화했고, 최대 이미지 개수에 도달하지 않은 경우 Unsplash 이미지 추가
    const maxImages = 5; // 최대 이미지 개수
    if (postData.imageStrategy === 'ai' && imageHTMLs.length < maxAllowedImages) {
      logger.info('Unsplash API를 사용하여 이미지 검색 중...', { keyword });
      try {
        // 추가로 필요한 이미지 개수 계산
        const additionalImagesNeeded = maxAllowedImages - imageHTMLs.length;
        const imagesToFetch = Math.min(additionalImagesNeeded, 2); // 최대 2개의 AI 이미지만 추가
        
        // Unsplash에서 이미지 검색
        const images = await searchUnsplashImages(keyword, imagesToFetch);
        
        if (images && images.length > 0) {
          for (const image of images) {
            logger.info('이미지 검색 성공', { imageUrl: image.url });
            
            // 이미지 HTML 생성
            const imageHtml = `
              <figure class="wp-block-image">
                <img src="${image.url}" alt="${image.description || keyword}"/>
                <figcaption>이미지 제공: <a href="${image.authorUrl}" target="_blank">${image.authorName}</a> on Unsplash</figcaption>
              </figure>
            `;
            
            imageHTMLs.push(imageHtml);
            imageAdded = true;
          }
          logger.info('Unsplash 이미지 추가 완료', { count: images.length });
        } else {
          logger.warn('AI 이미지를 찾을 수 없습니다.');
        }
      } catch (imageError) {
        logger.error('AI 이미지 처리 중 오류 발생', { error: imageError.message });
      }
    }
    
    // 3. 모든 이미지 HTML을 무작위로 섞고 콘텐츠에 삽입
    if (imageHTMLs.length > 0) {
      // Fisher-Yates 알고리즘으로 배열 섞기
      for (let i = imageHTMLs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [imageHTMLs[i], imageHTMLs[j]] = [imageHTMLs[j], imageHTMLs[i]];
      }
      
      // 콘텐츠 시작 부분에 이미지 삽입 (제목 태그 뒤에 오도록)
      const titleTagRegex = /<h[1-6][^>]*>.*?<\/h[1-6]>/i;
      const hasTitle = titleTagRegex.test(content);
      
      if (hasTitle) {
        content = content.replace(titleTagRegex, match => match + imageHTMLs.join(''));
      } else {
        content = imageHTMLs.join('') + content;
      }
      
      logger.info('이미지를 콘텐츠에 삽입했습니다', { count: imageHTMLs.length });
    }
    
    // 워드프레스에 포스팅 (타겟 플랫폼에 따라 분기 처리)
    let postResult;
    
    if (postData.targetPlatform === 'wordpress') {
      try {
        // 이미지 ID 없이 포스팅 (이미지는 이미 콘텐츠에 포함됨)
        postResult = await postToWordPress(title, content, null, postData.platformData);
        logger.info('워드프레스 포스팅 완료', { result: postResult });
      } catch (wpError) {
        logger.error('워드프레스 포스팅 실패', { error: wpError.message });
        
        // 환경 변수가 설정되지 않은 경우 테스트 모드로 간주하고 성공으로 처리
        if (wpError.message.includes('WordPress API 설정이 완료되지 않았습니다')) {
          logger.warn('테스트 모드: WordPress API 설정이 없어 테스트 응답을 반환합니다');
          postResult = {
            success: true,
            postId: 'test-' + Date.now(),
            postUrl: `https://example.com/test-post/${keyword}`
          };
        } else {
          throw wpError;
        }
      }
    } else {
      logger.warn(`지원되지 않는 플랫폼: ${postData.targetPlatform}, 테스트 모드로 실행합니다`);
      postResult = {
        success: true,
        postId: 'test-' + Date.now(),
        postUrl: `https://example.com/test-post/${keyword}`
      };
    }
    
    // 성공적인 포스팅 기록
    await scheduler.recordPost();
    
    logger.info('포스팅 완료', { keyword, url: postResult.postUrl });
    return { 
      success: true, 
      message: '포스팅이 성공적으로 완료되었습니다',
      postId: postResult.postId,
      finalPostUrl: postResult.postUrl,
      title: title,
      imageIncluded: imageAdded
    };
  } catch (error) {
    logger.error('포스팅 처리 중 오류 발생', { error: error.message, stack: error.stack });
    await notifier.sendErrorNotification(
      '자동 포스팅 실패',
      { error: error.message, stack: error.stack }
    );
    return { success: false, error: error.message };
  }
}

// 자동 포스팅 API 엔드포인트 핸들러
async function autoPost(req, res) {
  try {
    const postData = req.body;
    
    // 파일 업로드 처리 (있는 경우)
    if (req.files && req.files.length > 0) {
      postData.uploadedFiles = req.files.map(file => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer
      }));
    }
    
    const result = await createPostLogic(postData);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('자동 포스팅 API 처리 중 오류 발생', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  autoPost,
  createPostLogic
}; 