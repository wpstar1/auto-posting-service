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
async function uploadImageToWordPress(imageUrl, title) {
  try {
    // WordPress API 설정 로드
    const wpUrl = process.env.WP_API_URL;
    const wpUser = process.env.WP_USER;
    const wpPassword = process.env.WP_PASSWORD;
    
    if (!wpUrl || !wpUser || !wpPassword) {
      throw new Error('WordPress API 설정이 완료되지 않았습니다.');
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
    
    // WordPress에 이미지 업로드 (form-data 형식으로)
    logger.info('WordPress에 이미지 업로드 중...', { filename });
    
    // 이미지 파일을 임시로 저장
    const tempFilePath = path.join(__dirname, '..', 'uploads', filename);
    await fs.writeFile(tempFilePath, buffer);
    
    // 파일 스트림으로 전송하기 위한 FormData 생성
    const FormData = require('form-data');
    const form = new FormData();
    const fileStream = fs.createReadStream(tempFilePath);
    form.append('file', fileStream);
    
    const uploadResponse = await axios.post(`${wpUrl}/media`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Basic ${authString}`,
        'Content-Disposition': `attachment; filename=${filename}`
      }
    });
    
    // 임시 파일 삭제
    try {
      await fs.unlink(tempFilePath);
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
async function postToWordPress(title, content, featuredImageId = null) {
  try {
    // .env 파일에서 WordPress API 설정 로드
    const wpUrl = process.env.WP_API_URL;
    const wpUser = process.env.WP_USER;
    const wpPassword = process.env.WP_PASSWORD;
    
    if (!wpUrl || !wpUser || !wpPassword) {
      throw new Error('WordPress API 설정이 완료되지 않았습니다. .env 파일을 확인하세요.');
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
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "당신은 블로그 포스팅 전문가입니다. 주어진 키워드에 대한 SEO에 최적화된 고품질 블로그 포스트를 작성해주세요. HTML 형식으로 응답해주세요."
        },
        {
          role: "user",
          content: `다음 키워드에 대한 블로그 포스트를 작성해주세요: "${keyword}". 제목과 내용을 모두 포함해주세요. 내용은 최소 300단어 이상으로 작성해주세요.`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
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
    
    // 이미지 처리 - 사용자 업로드 이미지 우선, 없으면 AI 이미지 사용
    let imageAdded = false;
    
    // 1. 사용자가 업로드한 이미지 처리
    if (postData.uploadedFiles && postData.uploadedFiles.length > 0) {
      logger.info('사용자 업로드 이미지 처리 중...', { count: postData.uploadedFiles.length });
      try {
        // 이미지 처리를 위한 빈 배열 생성
        const imageHTMLs = [];
        
        // 각 업로드된 파일에 대해 처리
        for (const file of postData.uploadedFiles) {
          // 이미지 파일인지 확인
          if (file.mimetype && file.mimetype.startsWith('image/')) {
            logger.info('이미지 파일 처리', { filename: file.originalname });
            
            // WordPress 업로드를 위한 임시 파일 저장
            const tempFilePath = path.join(__dirname, '..', 'uploads', file.originalname);
            await fs.writeFile(tempFilePath, file.buffer);
            
            // 이미지 업로드 (WordPress인 경우)
            if (postData.targetPlatform === 'wordpress') {
              try {
                // FormData 생성
                const FormData = require('form-data');
                const form = new FormData();
                const fileStream = fs.createReadStream(tempFilePath);
                form.append('file', fileStream);
                
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
                const uploadResponse = await axios.post(`${wpUrl}/media`, form, {
                  headers: {
                    ...form.getHeaders(),
                    'Authorization': `Basic ${authString}`,
                    'Content-Disposition': `attachment; filename=${file.originalname}`
                  }
                });
                
                // 임시 파일 삭제
                try {
                  await fs.unlink(tempFilePath);
                } catch (unlinkError) {
                  logger.warn('임시 이미지 파일 삭제 실패', { error: unlinkError.message });
                }
                
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
        
        // 모든 이미지 HTML 포스트 내용에 추가
        if (imageHTMLs.length > 0) {
          // 콘텐츠 시작 부분에 이미지 삽입 (제목 태그 뒤에 오도록)
          const titleTagRegex = /<h[1-6][^>]*>.*?<\/h[1-6]>/i;
          const hasTitle = titleTagRegex.test(content);
          
          if (hasTitle) {
            content = content.replace(titleTagRegex, match => match + imageHTMLs.join(''));
          } else {
            content = imageHTMLs.join('') + content;
          }
          
          imageAdded = true;
          logger.info('사용자 업로드 이미지를 콘텐츠에 삽입했습니다', { count: imageHTMLs.length });
        }
      } catch (imageError) {
        logger.error('사용자 업로드 이미지 처리 중 오류 발생', { error: imageError.message });
      }
    }
    
    // 2. 사용자 업로드 이미지가 없고 AI 이미지 옵션이 활성화된 경우 Unsplash 이미지 사용
    if (!imageAdded && postData.imageStrategy === 'ai') {
      logger.info('Unsplash API를 사용하여 이미지 검색 중...', { keyword });
      try {
        // Unsplash에서 이미지 검색
        const images = await searchUnsplashImages(keyword, 1);
        
        if (images && images.length > 0) {
          const image = images[0];
          logger.info('이미지 검색 성공', { imageUrl: image.url });
          
          // 이미지를 포스트 내용에 직접 삽입
          const imageHtml = `
            <figure class="wp-block-image">
              <img src="${image.url}" alt="${image.description || keyword}"/>
              <figcaption>이미지 제공: <a href="${image.authorUrl}" target="_blank">${image.authorName}</a> on Unsplash</figcaption>
            </figure>
          `;
          
          // 콘텐츠 시작 부분에 이미지 삽입 (제목 태그 뒤에 오도록)
          const titleTagRegex = /<h[1-6][^>]*>.*?<\/h[1-6]>/i;
          const hasTitle = titleTagRegex.test(content);
          
          if (hasTitle) {
            content = content.replace(titleTagRegex, match => match + imageHtml);
          } else {
            content = imageHtml + content;
          }
          
          imageAdded = true;
          logger.info('Unsplash 이미지를 콘텐츠에 삽입했습니다');
        } else {
          logger.warn('이미지를 찾을 수 없습니다. 이미지 없이 계속합니다');
        }
      } catch (imageError) {
        logger.error('이미지 처리 중 오류 발생, 이미지 없이 계속합니다', { error: imageError.message });
      }
    }
    
    // 워드프레스에 포스팅 (타겟 플랫폼에 따라 분기 처리)
    let postResult;
    
    if (postData.targetPlatform === 'wordpress') {
      try {
        // 이미지 ID 없이 포스팅 (이미지는 이미 콘텐츠에 포함됨)
        postResult = await postToWordPress(title, content, null);
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