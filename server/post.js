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

// WordPress에 이미지 업로드 (API와 XML-RPC 방식 모두 지원)
async function uploadImageToWordPress(imageUrl, title, platformData = null) {
  try {
    let wpUrl, wpUser, wpPassword, wpApi;
    
    // 플랫폼 데이터가 있으면 해당 데이터 사용, 없으면 환경 변수 사용
    if (platformData && platformData.siteUrl && platformData.username && platformData.password) {
      wpUrl = platformData.siteUrl;
      wpUser = platformData.username;
      wpPassword = platformData.password;
      wpApi = platformData.apiType || 'rest'; // 'rest' 또는 'xmlrpc'
      logger.info('플랫폼 데이터를 사용하여 WordPress 인증 정보 설정', { wpUrl, wpApi });
    } else {
      // 환경 변수에서 정보 가져오기
      wpUrl = process.env.WP_API_URL;
      wpUser = process.env.WP_USER;
      wpPassword = process.env.WP_PASSWORD;
      wpApi = process.env.WP_API_TYPE || 'rest';
      logger.info('환경 변수에서 WordPress 인증 정보 가져오기', { wpUrl, wpApi });
    }
    
    // 필요한 정보가 있는지 확인
    if (!wpUrl || !wpUser || !wpPassword) {
      throw new Error('WordPress API 설정이 완료되지 않았습니다. 워드프레스 계정 설정을 확인하세요.');
    }
    
    // URL 형식화 - 전체 URL 형식 체크 및 수정
    // URL에서 http:// 또는 https:// 접두사가 없는 경우 추가
    if (!wpUrl.startsWith('http://') && !wpUrl.startsWith('https://')) {
      wpUrl = 'https://' + wpUrl;
      logger.info('URL에 https:// 접두사 추가', { wpUrl });
    }
    
    // 슬래시로 끝나는 경우 제거
    wpUrl = wpUrl.replace(/\/$/, '');
    
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
    
    // 이미지의 content-type 결정
    let contentType = 'image/jpeg';
    if (filename.endsWith('.png')) {
      contentType = 'image/png';
    } else if (filename.endsWith('.gif')) {
      contentType = 'image/gif';
    }
    
    // API 유형에 따라 적절한 업로드 방법 선택
    let uploadResult;
    
    // REST API 방식
    if (wpApi === 'rest') {
      uploadResult = await uploadImageViaRestApi(wpUrl, wpUser, wpPassword, buffer, filename, contentType, title);
    } 
    // XML-RPC 방식 (XML-RPC 모듈이 필요)
    else if (wpApi === 'xmlrpc') {
      uploadResult = await uploadImageViaXmlRpc(wpUrl, wpUser, wpPassword, buffer, filename, contentType, title);
    }
    // 기본값: 둘 다 시도
    else {
      try {
        // 먼저 REST API 시도
        uploadResult = await uploadImageViaRestApi(wpUrl, wpUser, wpPassword, buffer, filename, contentType, title);
      } catch (restError) {
        logger.warn('REST API 이미지 업로드 실패, XML-RPC 시도 중...', { error: restError.message });
        // REST API 실패 시 XML-RPC 시도
        uploadResult = await uploadImageViaXmlRpc(wpUrl, wpUser, wpPassword, buffer, filename, contentType, title);
      }
    }
    
    return uploadResult;
  } catch (error) {
    // 응답 데이터 확인을 위한 디버깅 정보 추가
    if (error.response) {
      logger.error('WordPress 이미지 업로드 API 응답 오류', { 
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers
      });
      
      // HTML 응답인 경우 로그 추가
      if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE')) {
        logger.error('WordPress API가 HTML을 반환했습니다. API URL이 올바른지 확인하세요.');
      }
    } else if (error.request) {
      logger.error('WordPress 이미지 업로드 실패 - 응답이 없음', { error: error.message });
    } else {
      logger.error('WordPress 이미지 업로드 실패', { error: error.message });
    }
    throw error;
  }
}

// REST API를 통한 이미지 업로드
async function uploadImageViaRestApi(wpUrl, wpUser, wpPassword, buffer, filename, contentType, title) {
  // REST API URL 구성
  let apiUrl = wpUrl;
  
  // URL이 /wp-json으로 끝나는 경우
  if (wpUrl.endsWith('/wp-json')) {
    apiUrl = `${wpUrl}/wp/v2/media`;
  }
  // URL이 /wp-json/wp/v2로 끝나는 경우
  else if (wpUrl.endsWith('/wp-json/wp/v2')) {
    apiUrl = `${wpUrl}/media`;
  }
  // 그 외 경우는 /wp-json/wp/v2/media 추가
  else {
    apiUrl = `${wpUrl}/wp-json/wp/v2/media`;
  }
  
  logger.info('REST API 이미지 업로드 URL', { apiUrl });
  
  // WordPress 인증을 위한 토큰 생성
  const authString = Buffer.from(`${wpUser}:${wpPassword}`).toString('base64');
  
  // FormData 생성 및 파일 첨부
  const FormData = require('form-data');
  const form = new FormData();
  
  // 기존 createReadStream 대신 버퍼 직접 추가
  form.append('file', buffer, {
    filename: filename,
    contentType: contentType
  });
  
  // 제목 추가 (있는 경우)
  if (title) {
    form.append('title', title);
  }
  
  // WordPress에 이미지 업로드
  logger.info('REST API로 이미지 업로드 시도', { filename });
  
  const uploadResponse = await axios.post(apiUrl, form, {
    headers: {
      ...form.getHeaders(),
      'Authorization': `Basic ${authString}`,
      'Content-Disposition': `attachment; filename=${filename}`
    },
    // 타임아웃 설정
    timeout: 30000
  });
  
  if (uploadResponse.status === 201) {
    logger.info('REST API 이미지 업로드 성공', { 
      mediaId: uploadResponse.data.id,
      url: uploadResponse.data.source_url
    });
    
    return {
      id: uploadResponse.data.id,
      url: uploadResponse.data.source_url
    };
  } else {
    throw new Error(`WordPress REST API 이미지 업로드 오류: ${uploadResponse.status}`);
  }
}

// XML-RPC를 통한 이미지 업로드
async function uploadImageViaXmlRpc(wpUrl, wpUser, wpPassword, buffer, filename, contentType, title) {
  // XML-RPC 라이브러리 로드 (필요 시 설치: npm install xmlrpc)
  const xmlrpc = require('xmlrpc');
  
  // XML-RPC 엔드포인트 URL 구성
  const xmlrpcUrl = wpUrl.replace(/\/wp-json.*$/, '') + '/xmlrpc.php';
  logger.info('XML-RPC 이미지 업로드 URL', { xmlrpcUrl });
  
  // XML-RPC 클라이언트 생성
  const client = xmlrpc.createSecureClient(xmlrpcUrl);
  
  // 이미지 데이터 준비
  const imageData = {
    name: filename,
    type: contentType,
    bits: buffer,
    overwrite: true
  };
  
  // XML-RPC 메서드 실행을 Promise로 래핑
  return new Promise((resolve, reject) => {
    client.methodCall('wp.uploadFile', [
      0,               // 블로그 ID (보통 0)
      wpUser,          // 사용자명
      wpPassword,      // 비밀번호
      imageData        // 이미지 데이터
    ], (error, value) => {
      if (error) {
        logger.error('XML-RPC 이미지 업로드 실패', { error: error.message });
        reject(error);
      } else {
        logger.info('XML-RPC 이미지 업로드 성공', { 
          id: value.id,
          url: value.url
        });
        resolve({
          id: value.id,
          url: value.url
        });
      }
    });
  });
}

// 워드프레스에 포스팅하는 함수
async function postToWordPress(title, content, featuredImageId = null, platformData = null, postDate = null) {
  try {
    let wpUrl, wpUser, wpPassword, apiType;
    
    // platformData가 있으면 해당 데이터 사용, 없으면 환경 변수 사용
    if (platformData && platformData.siteUrl && platformData.username && platformData.password) {
      wpUrl = platformData.siteUrl;
      wpUser = platformData.username;
      wpPassword = platformData.password;
      apiType = platformData.apiType || process.env.WP_API_TYPE || 'rest'; // API 타입 설정
      logger.info('플랫폼 데이터를 사용하여 WordPress 인증 정보 설정', { wpUrl, apiType });
    } else {
      // 환경 변수에서 정보 가져오기
      wpUrl = process.env.WP_API_URL;
      wpUser = process.env.WP_USER;
      wpPassword = process.env.WP_PASSWORD;
      apiType = process.env.WP_API_TYPE || 'rest'; // 기본값은 REST API
      logger.info('환경 변수에서 WordPress 인증 정보 가져오기', { wpUrl, apiType });
    }
    
    // 필요한 정보가 있는지 확인
    if (!wpUrl || !wpUser || !wpPassword) {
      throw new Error('WordPress API 설정이 완료되지 않았습니다. 워드프레스 계정 설정을 확인하세요.');
    }
    
    // URL 형식화 - 전체 URL 형식 체크 및 수정
    // URL에서 http:// 또는 https:// 접두사가 없는 경우 추가
    if (!wpUrl.startsWith('http://') && !wpUrl.startsWith('https://')) {
      wpUrl = 'https://' + wpUrl;
      logger.info('URL에 https:// 접두사 추가', { wpUrl });
    }
    
    // 슬래시로 끝나는 경우 제거
    wpUrl = wpUrl.replace(/\/$/, '');
    
    // API 타입에 따라 적절한 함수 호출
    if (apiType.toLowerCase() === 'xmlrpc') {
      return await postToWordPressViaXmlRpc(wpUrl, wpUser, wpPassword, title, content, featuredImageId, postDate);
    } else {
      return await postToWordPressViaRestApi(wpUrl, wpUser, wpPassword, title, content, featuredImageId, postDate);
    }
  } catch (error) {
    logger.error('WordPress 포스팅 실패', { error: error.message });
    throw error;
  }
}

// REST API를 통한 워드프레스 포스팅
async function postToWordPressViaRestApi(wpUrl, wpUser, wpPassword, title, content, featuredImageId = null, postDate = null) {
  try {
    // URL이 /wp-json으로 끝나는 경우
    if (wpUrl.endsWith('/wp-json')) {
      wpUrl = `${wpUrl}/wp/v2`;
    }
    // URL이 /wp-json/wp/v2로 끝나지 않으면 추가
    else if (!wpUrl.includes('/wp-json/wp/v2') && !wpUrl.includes('/wp-json/wp/v2/')) {
      wpUrl = `${wpUrl}/wp-json/wp/v2`;
    }
    
    logger.info('REST API WordPress URL 설정', { finalWpUrl: wpUrl });
    
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
    
    // 포스팅 날짜 설정
    if (postDate) {
      postData.date = postDate;
    }
    
    // API 엔드포인트 URL 구성
    const apiEndpoint = `${wpUrl}/posts`;
    logger.info('WordPress REST API 호출', { apiEndpoint });
    
    // WordPress REST API를 통해 포스트 생성
    const response = await axios.post(apiEndpoint, postData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`
      }
    });
    
    if (response.status === 201) {
      logger.info('REST API를 통한 WordPress 포스팅 성공', { postId: response.data.id });
      return {
        success: true,
        postId: response.data.id,
        postUrl: response.data.link
      };
    } else {
      throw new Error(`WordPress REST API 응답 오류: ${response.status}`);
    }
  } catch (error) {
    // 응답 데이터 확인을 위한 디버깅 정보 추가
    if (error.response) {
      logger.error('WordPress REST API 응답 오류', { 
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data
      });
      
      // HTML 응답인 경우 로그 추가
      if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE')) {
        logger.error('WordPress REST API가 HTML을 반환했습니다. API URL이 올바른지 확인하세요.');
      }
    } else if (error.request) {
      logger.error('WordPress REST API 포스팅 실패 - 응답이 없음', { error: error.message });
    } else {
      logger.error('WordPress REST API 포스팅 실패', { error: error.message });
    }
    throw error;
  }
}

// XML-RPC를 통한 워드프레스 포스팅
async function postToWordPressViaXmlRpc(wpUrl, wpUser, wpPassword, title, content, featuredImageId = null, postDate = null) {
  try {
    // XML-RPC 라이브러리 로드
    const xmlrpc = require('xmlrpc');
    
    // XML-RPC 엔드포인트 URL 구성
    const xmlrpcUrl = wpUrl.replace(/\/wp-json.*$/, '') + '/xmlrpc.php';
    logger.info('XML-RPC 포스팅 URL', { xmlrpcUrl });
    
    // XML-RPC 클라이언트 생성 (SSL 또는 일반)
    const client = xmlrpcUrl.startsWith('https://') 
      ? xmlrpc.createSecureClient(xmlrpcUrl)
      : xmlrpc.createClient(xmlrpcUrl);
    
    // 포스트 컨텐츠 구성
    const postContent = {
      post_title: title,
      post_content: content,
      post_status: 'publish',
      post_type: 'post',
      terms_names: {
        category: ['General'] // 기본 카테고리
      }
    };
    
    // 특성 이미지 설정
    if (featuredImageId) {
      postContent.post_thumbnail = featuredImageId;
    }
    
    // 포스팅 날짜 설정
    if (postDate) {
      postContent.post_date = postDate;
    }
    
    // XML-RPC 메서드 실행을 Promise로 래핑
    return new Promise((resolve, reject) => {
      client.methodCall('wp.newPost', [
        0,               // 블로그 ID (보통 0)
        wpUser,          // 사용자명
        wpPassword,      // 비밀번호
        postContent      // 포스트 내용
      ], (error, value) => {
        if (error) {
          logger.error('XML-RPC 포스팅 실패', { error: error.message });
          reject(error);
        } else {
          const postId = value; // XML-RPC는 post ID를 반환
          logger.info('XML-RPC를 통한 WordPress 포스팅 성공', { postId });
          
          // 포스트 URL 가져오기 위한 추가 호출
          client.methodCall('wp.getPost', [
            0,               // 블로그 ID
            wpUser,          // 사용자명
            wpPassword,      // 비밀번호
            postId,          // 포스트 ID
            ['post_title', 'link'] // 가져올 필드
          ], (err, postData) => {
            if (err) {
              logger.warn('포스트 URL 가져오기 실패', { error: err.message });
              resolve({
                success: true,
                postId: postId,
                postUrl: `${wpUrl.replace(/\/xmlrpc\.php$/, '')}/?p=${postId}`
              });
            } else {
              resolve({
                success: true,
                postId: postId,
                postUrl: postData.link
              });
            }
          });
        }
      });
    });
  } catch (error) {
    logger.error('XML-RPC 포스팅 실패', { error: error.message });
    throw error;
  }
}

// AI로 컨텐츠 생성 (OpenAI API 사용)
async function generateAIContent(keyword, postData = null) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      logger.warn('OpenAI API 키가 설정되지 않았습니다. 더미 콘텐츠를 반환합니다.');
      return getDummyContent(keyword);
    }
    
    // 키워드 변형을 위한 전처리
    const transformedKeyword = await transformKeyword(keyword, openaiApiKey);
    logger.info('키워드 변형 완료', { originalKeyword: keyword, transformedKeyword });
    
    // 현재 시간과 세션 ID를 사용하여 항상 고유한 컨텐츠 보장
    const sessionId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const timestamp = new Date().toISOString();
    
    // 콘텐츠 스타일 선택
    const contentStyle = selectContentStyle(postData);
    
    // 사용자 수준에 맞는 복잡성 결정 (1-10 스케일)
    const complexity = postData?.userLevel === 'vip' ? Math.floor(Math.random() * 3) + 7 : Math.floor(Math.random() * 3) + 4;
    
    // 다양한 프롬프트 템플릿 정의
    const promptTemplates = getPromptTemplates(transformedKeyword, complexity);
    
    // 스타일에 따라 프롬프트 선택
    const selectedPrompt = selectPromptByStyle(promptTemplates, contentStyle, transformedKeyword);
    
    // 시스템 프롬프트 구성
    const systemPrompt = `${selectedPrompt}

고유 ID: ${sessionId}
생성 시간: ${timestamp}
키워드: ${transformedKeyword}
원본 키워드: ${keyword}
복잡성 수준: ${complexity}/10

중요 지침:
1. 제목은 반드시 <h1> 태그로 시작하며, 독창적이고 흥미로운 제목이어야 합니다.
2. 다른 기존 콘텐츠와 중복되지 않는 완전히 새로운 내용을 작성하세요.
3. 문장과 단락의 길이를 다양하게 하고, 일부 문장은 짧게, 일부는 길게 작성하세요.
4. 작성된 콘텐츠는 논리적 흐름을 가지고 명확하게 구성되어야 합니다.
5. 최소 3개 이상의 소제목(<h2> 태그)을 사용하여 콘텐츠를 구조화하세요.
6. 강조할 내용은 <strong> 태그를 사용하세요.
7. 목록이 필요한 경우 <ul> 또는 <ol> 태그를 사용하세요.`;

    logger.info('OpenAI API 호출 준비 완료', { 
      transformedKeyword,
      sessionId,
      contentStyle, 
      promptType: selectedPrompt.substring(0, 30) + '...',
      complexity
    });
    
    // API 호출
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: systemPrompt
        }
      ],
      temperature: 0.9 + (Math.random() * 0.1), // 0.9~1.0 사이의 랜덤 값으로 다양성 극대화
      max_tokens: 1500,
      presence_penalty: 0.6, // 반복 감소
      frequency_penalty: 0.7 // 반복 감소
    }, {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content;
      
      // 응답에서 제목과 내용 분리
      let title = `${transformedKeyword}에 대한 심층 분석`;
      let htmlContent = content;
      
      // HTML 응답에서 제목 추출 시도
      const titleMatch = content.match(/<h1>(.*?)<\/h1>/) || content.match(/<h2>(.*?)<\/h2>/) || content.match(/#\s+(.*?)[\r\n]/);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }
      
      // 콘텐츠 후처리 - 이미지 삽입 위치 마크업 추가
      htmlContent = addImagePlaceholders(htmlContent);
      
      logger.info('OpenAI 콘텐츠 생성 성공', { title, contentPreview: htmlContent.substring(0, 100) + '...' });
      return { title, content: htmlContent, transformedKeyword };
    } else {
      logger.error('OpenAI API 응답 형식 오류');
      return getDummyContent(transformedKeyword || keyword);
    }
  } catch (error) {
    logger.error('OpenAI 콘텐츠 생성 실패', { error: error.message });
    return getDummyContent(keyword);
  }
}

// 키워드 변형 함수
async function transformKeyword(keyword, apiKey) {
  try {
    // 동의어, 관련어, 확장어, 세부 주제어 등 다양한 변형을 요청
    const variations = [
      `"${keyword}"의 더 구체적인 주제는?`,
      `"${keyword}"와 관련된 틈새 키워드는?`,
      `"${keyword}"를 다른 관점에서 표현한다면?`,
      `"${keyword}"의 확장된 개념은?`,
      `"${keyword}"에 관한 흥미로운 질문은?`
    ];
    
    // 랜덤하게 변형 방식 선택
    const randomVariation = variations[Math.floor(Math.random() * variations.length)];
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "주어진 키워드의 변형을 생성합니다. 원래 키워드와 의미적으로 연관되지만 다른 표현이나 더 구체적인 주제여야 합니다. 단어나 짧은 구문으로만 답변하세요."
        },
        {
          role: "user",
          content: randomVariation
        }
      ],
      temperature: 0.8,
      max_tokens: 50
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.choices && response.data.choices.length > 0) {
      // 따옴표, 특수문자 제거 및 공백 정리
      let transformed = response.data.choices[0].message.content.trim();
      transformed = transformed.replace(/^["']|["']$/g, '').trim();
      
      // 변형된 키워드가 너무 짧으면 원본 사용
      if (transformed.length < 2) {
        return keyword;
      }
      
      return transformed;
    }
    
    return keyword; // 변형 실패시 원본 반환
  } catch (error) {
    logger.error('키워드 변형 실패', { error: error.message });
    return keyword; // 오류 발생 시 원본 키워드 사용
  }
}

// 콘텐츠 스타일 선택 함수
function selectContentStyle(postData) {
  // 스타일 배열 정의
  const styles = ['expert', 'experience', 'qa', 'listicle', 'howto', 'compare'];
  
  // postData에 promptStyle이 있으면 사용, 없으면 랜덤
  if (postData && postData.promptStyle && styles.includes(postData.promptStyle)) {
    return postData.promptStyle;
  }
  
  // 랜덤 스타일 선택
  return styles[Math.floor(Math.random() * styles.length)];
}

// 다양한 프롬프트 템플릿 정의 함수
function getPromptTemplates(keyword, complexity) {
  return {
    expert: `당신은 "${keyword}" 분야의 최고 전문가입니다. 이 주제에 대한 심층적이고 통찰력 있는 분석을 HTML 형식으로 작성해주세요. 복잡성 수준(${complexity}/10)에 맞게 전문 용어와 고급 개념을 적절히 사용하고, 최신 연구 동향이나 업계 현황을 포함해주세요. 독자들에게 실질적인 가치를 제공하는 전문적인 콘텐츠여야 합니다.`,
    
    experience: `당신은 "${keyword}"에 대한 풍부한 개인적 경험과 지식을 가진 블로거입니다. 이 주제에 관한 생생한 경험담과 배운 교훈을 중심으로 공감대를 형성하는 HTML 형식의 글을 작성해주세요. 복잡성 수준(${complexity}/10)에 맞게 스토리텔링 요소와 개인적인 통찰을 적절히 포함시켜 독자들이 몰입할 수 있도록 해주세요.`,
    
    qa: `당신은 "${keyword}"에 관한 질문과 답변 형식의 종합 가이드를 작성하는 전문가입니다. 이 주제에 대해 사람들이 가장 궁금해하는 5-8개의 핵심 질문을 선정하고, 복잡성 수준(${complexity}/10)에 맞게 명확하고 유용한 답변을 HTML 형식으로 제공해주세요. 각 질문과 답변은 논리적으로 연결되어 완전한 가이드로 기능해야 합니다.`,
    
    listicle: `당신은 "${keyword}"에 관한 목록형 콘텐츠를 작성하는 전문가입니다. 이 주제와 관련된 중요한 항목을 7-10개 선정하여 각각에 대한 설명과 분석을 HTML 형식으로 작성해주세요. 복잡성 수준(${complexity}/10)에 맞게 각 항목은 독립적이면서도 전체적으로 일관된 주제를 다루어야 합니다. 구체적인 예시와 근거를 포함해주세요.`,
    
    howto: `당신은 "${keyword}"에 관한 단계별 가이드를 작성하는 전문가입니다. 이 주제와 관련된 과정이나 절차를 6-9개의 명확한 단계로 나누어 HTML 형식으로 설명해주세요. 복잡성 수준(${complexity}/10)에 맞게 각 단계에 대한 상세한 설명, 주의사항, 팁을 포함하고, 전체 과정이 논리적으로 이어지도록 작성해주세요.`,
    
    compare: `당신은 "${keyword}"에 관한 비교 분석 콘텐츠를 작성하는 전문가입니다. 이 주제와 관련된 다양한 관점, 방법, 제품 또는 이론을 비교하여 HTML 형식으로 분석해주세요. 복잡성 수준(${complexity}/10)에 맞게 각 비교 항목의 장단점을 명확히 제시하고, 객관적인 기준에 따른 평가를 포함해주세요.`
  };
}

// 스타일에 따라 프롬프트 선택 함수
function selectPromptByStyle(promptTemplates, style, keyword) {
  // 선택한 스타일에 해당하는 프롬프트 있으면 사용
  if (promptTemplates[style]) {
    return promptTemplates[style];
  }
  
  // 없으면 랜덤 선택
  const templates = Object.values(promptTemplates);
  return templates[Math.floor(Math.random() * templates.length)];
}

// 이미지 삽입 위치 마크업 추가 함수
function addImagePlaceholders(content) {
  // 이미 이미지 마크업이 있는 경우 처리 중단
  if (content.includes('<!-- IMAGE_PLACEHOLDER -->')) {
    return content;
  }
  
  // h2 태그 뒤에 이미지 플레이스홀더 추가
  let modifiedContent = content.replace(/<h2>(.*?)<\/h2>/g, 
    (match, group1) => `<h2>${group1}</h2>\n<!-- IMAGE_PLACEHOLDER -->\n`);
  
  // 시작 부분에 이미지 위치 표시가 없으면 추가
  if (!modifiedContent.includes('<!-- IMAGE_PLACEHOLDER -->')) {
    // h1 태그 뒤에 이미지 플레이스홀더 추가
    modifiedContent = modifiedContent.replace(/<h1>(.*?)<\/h1>/i, 
      (match) => `${match}\n<!-- IMAGE_PLACEHOLDER -->\n`);
  }
  
  return modifiedContent;
}

// 더미 콘텐츠 생성 (API 실패 또는 API 키 없을 때 사용)
function getDummyContent(keyword) {
  const timestamp = new Date().toLocaleString();
  const randomId = Math.random().toString(36).substring(2, 10);
  
  return {
    title: `${keyword}에 대한 모든 것 [${randomId}]`,
    content: `
      <h1>${keyword}에 대한 종합 가이드</h1>
      <!-- IMAGE_PLACEHOLDER -->
      <p>이 글은 <strong>${keyword}</strong>에 대한 자동 생성된 글입니다. (${timestamp} 생성)</p>
      <h2>${keyword}의 기본 개념</h2>
      <!-- IMAGE_PLACEHOLDER -->
      <p>${keyword}는 매우 중요한 주제입니다. 이에 대해 자세히 알아보겠습니다.</p>
      <p>이 콘텐츠는 테스트용으로 자동 생성되었으며, 실제 프로덕션에서는 OpenAI API를 통해 생성된 고품질 콘텐츠로 대체됩니다.</p>
      <h2>${keyword}의 활용 방법</h2>
      <!-- IMAGE_PLACEHOLDER -->
      <p>${keyword}를 효과적으로 활용하는 방법에는 여러 가지가 있습니다.</p>
      <ul>
        <li>첫 번째 방법: ${randomId.substring(0, 4)}</li>
        <li>두 번째 방법: ${randomId.substring(4, 8)}</li>
      </ul>
    `,
    transformedKeyword: keyword
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
    
    // 키워드 정리 (앞뒤 공백 제거)
    keyword = keyword.trim();
    logger.info('포스팅 키워드 확인', { keyword });
    
    // 스케줄러 확인
    if (!scheduler.canPostNow()) {
      logger.warn('포스팅 스케줄 제한으로 인해 포스팅을 건너뜁니다');
      return { success: false, error: '포스팅 스케줄 제한(시간 또는 일일 한도)으로 인해 포스팅을 건너뜁니다' };
    }
    
    // 포스팅 세션 ID 생성 (추적 및 중복 방지용)
    const postSessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    logger.info('포스팅 세션 생성', { postSessionId });

    // 컨텐츠 생성 전략에 따라 처리
    let title, content, transformedKeyword;
    
    // AI 컨텐츠 생성 옵션인 경우
    if (postData.contentStrategy === 'ai_only' || !postData.content) {
      logger.info('AI를 사용하여 컨텐츠 생성 중...', { keyword, sessionId: postSessionId });
      const aiContent = await generateAIContent(keyword, postData);
      title = aiContent.title;
      content = aiContent.content;
      transformedKeyword = aiContent.transformedKeyword || keyword;
      
      logger.info('AI 컨텐츠 생성 완료', { 
        title,
        transformedKeyword,
        contentLength: content.length,
        sessionId: postSessionId
      });
    } 
    // 사용자 지정 컨텐츠가 있는 경우
    else if (postData.content) {
      content = postData.content;
      title = postData.title || `${keyword} 관련 포스트`;
      transformedKeyword = keyword;
      logger.info('사용자 제공 컨텐츠 사용', { title, contentLength: content.length });
    } 
    // 기본 컨텐츠 사용 (이 부분은 위에서 처리되므로 실행되지 않음)
    else {
      title = `${keyword} 관련 포스트`;
      content = `<p>이것은 ${keyword}에 관한 기본 포스트입니다.</p>`;
      transformedKeyword = keyword;
    }
    
    // 이미지 처리 시작
    logger.info('이미지 처리 시작', { sessionId: postSessionId });
    
    // 이미지 관련 변수 초기화
    let featuredImageId = null;
    let imageAdded = false;
    const imageHTMLs = []; // 이미지 HTML을 모아둘 배열
    
    // 사용자 레벨에 따른 이미지 최대 개수 설정
    const MAX_IMAGES_LEVEL1 = 1;
    const MAX_IMAGES_VIP = 5;
    const maxAllowedImages = (postData.userLevel === 'vip') ? MAX_IMAGES_VIP : MAX_IMAGES_LEVEL1;
    
    // 이미지 위치 마커 추출
    const imagePlaceholders = extractImagePlaceholders(content);
    logger.info('이미지 위치 마커 추출', { 
      count: imagePlaceholders.length,
      positions: imagePlaceholders.map(p => p.index)
    });
    
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
                // 이미지를 임시 파일로 저장하지 않고 버퍼 직접 사용
                // 파일을 BASE64로 인코딩하여 데이터 URL 생성
                const base64Image = Buffer.from(file.buffer).toString('base64');
                const dataUrl = `data:${file.mimetype};base64,${base64Image}`;
                
                // platformData에 apiType 추가
                if (postData.platformData) {
                  // apiType이 전송된 경우 해당 값 사용
                  if (postData.apiType) {
                    postData.platformData.apiType = postData.apiType;
                    logger.info('클라이언트에서 전송된 API 타입 사용', { apiType: postData.apiType });
                  }
                }
                
                // 이미지 업로드 - platformData를 사용하도록 개선
                const uploadResult = await uploadImageToWordPress(
                  dataUrl, 
                  title || transformedKeyword, 
                  postData.platformData
                );
                
                if (uploadResult && uploadResult.url) {
                  logger.info('사용자 이미지 업로드 성공', { 
                    mediaId: uploadResult.id,
                    url: uploadResult.url
                  });
                  
                  // 첫 이미지를 특성 이미지로 설정
                  if (featuredImageId === null) {
                    featuredImageId = uploadResult.id;
                    logger.info('특성 이미지 설정', { featuredImageId });
                  }
                  
                  // 이미지 HTML 생성
                  const imageHtml = `
                    <figure class="wp-block-image">
                      <img src="${uploadResult.url}" alt="${title || transformedKeyword}"/>
                      <figcaption>사용자 업로드 이미지</figcaption>
                    </figure>
                  `;
                  imageHTMLs.push({
                    html: imageHtml,
                    type: 'user',
                    id: uploadResult.id
                  });
                }
              } catch (wpError) {
                logger.error('이미지 업로드 실패', { error: wpError.message });
                
                // 응답 데이터 확인을 위한 디버깅 정보 추가
                if (wpError.response) {
                  logger.error('WordPress 이미지 API 응답 오류', { 
                    status: wpError.response.status,
                    statusText: wpError.response.statusText,
                    headers: wpError.response.headers
                  });
                  
                  // HTML 응답인 경우 로그 추가
                  if (typeof wpError.response.data === 'string' && wpError.response.data.includes('<!DOCTYPE')) {
                    logger.error('WordPress API가 HTML을 반환했습니다. API URL이 올바른지 확인하세요.');
                  }
                }
              }
            } else {
              // 테스트 모드 - 이미지 URL 대신 placeholder 사용
              const imageHtml = `
                <figure class="wp-block-image">
                  <img src="https://via.placeholder.com/800x450.png?text=${encodeURIComponent(file.originalname)}" alt="${title}"/>
                  <figcaption>사용자 업로드 이미지 (테스트 모드)</figcaption>
                </figure>
              `;
              imageHTMLs.push({
                html: imageHtml,
                type: 'test',
                id: `test-${Date.now()}`
              });
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
    
    // 2. AI 이미지 옵션을 활성화했고, 최대 이미지 개수에 도달하지 않은 경우 Unsplash 이미지 추가
    const remainingImages = maxAllowedImages - imageHTMLs.length;
    if ((postData.imageStrategy === 'ai' || postData.imageStrategy === 'both') && remainingImages > 0) {
      logger.info('Unsplash API를 사용하여 이미지 검색 중...', { 
        keyword: transformedKeyword, 
        remainingSlots: remainingImages 
      });
      try {
        // 추가로 필요한 이미지 개수 계산
        const imagesToFetch = Math.min(remainingImages, 3); // 최대 3개의 AI 이미지만 추가
        
        // Unsplash에서 이미지 검색
        const images = await searchUnsplashImages(transformedKeyword, imagesToFetch);
        
        if (images && images.length > 0) {
          for (const image of images) {
            logger.info('이미지 검색 성공', { imageUrl: image.url });
            
            if (postData.targetPlatform === 'wordpress') {
              try {
                // 이미지 WordPress에 업로드
                const uploadResult = await uploadImageToWordPress(
                  image.url, 
                  title || transformedKeyword, 
                  postData.platformData
                );
                
                if (uploadResult && uploadResult.url) {
                  logger.info('Unsplash 이미지 업로드 성공', { 
                    mediaId: uploadResult.id,
                    url: uploadResult.url
                  });
                  
                  // 특성 이미지가 아직 설정되지 않았다면 설정
                  if (featuredImageId === null) {
                    featuredImageId = uploadResult.id;
                    logger.info('특성 이미지 설정', { featuredImageId });
                  }
                  
                  // 이미지 HTML 생성
                  const imageHtml = `
                    <figure class="wp-block-image">
                      <img src="${uploadResult.url}" alt="${image.description || transformedKeyword}"/>
                      <figcaption>이미지 제공: <a href="${image.authorUrl}" target="_blank">${image.authorName}</a> on Unsplash</figcaption>
                    </figure>
                  `;
                  
                  imageHTMLs.push({
                    html: imageHtml,
                    type: 'ai',
                    id: uploadResult.id
                  });
                  imageAdded = true;
                }
              } catch (uploadError) {
                logger.error('Unsplash 이미지 업로드 실패', { error: uploadError.message });
              }
            } else {
              // 테스트 모드
              const imageHtml = `
                <figure class="wp-block-image">
                  <img src="${image.url}" alt="${image.description || transformedKeyword}"/>
                  <figcaption>이미지 제공: ${image.authorName} on Unsplash (테스트 모드)</figcaption>
                </figure>
              `;
              
              imageHTMLs.push({
                html: imageHtml,
                type: 'ai_test',
                id: `unsplash-${Date.now()}`
              });
              imageAdded = true;
            }
          }
          logger.info('Unsplash 이미지 추가 완료', { count: images.length });
        } else {
          logger.warn('AI 이미지를 찾을 수 없습니다.');
        }
      } catch (imageError) {
        logger.error('AI 이미지 처리 중 오류 발생', { error: imageError.message });
      }
    }
    
    // 이미지 HTML을 콘텐츠에 삽입
    if (imageHTMLs.length > 0) {
      // Fisher-Yates 알고리즘으로 배열 섞기
      for (let i = imageHTMLs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [imageHTMLs[i], imageHTMLs[j]] = [imageHTMLs[j], imageHTMLs[i]];
      }
      
      // 이미지 배치 방식에 따라 콘텐츠에 삽입
      if (imagePlaceholders.length > 0) {
        // 이미지 위치 마커가 있는 경우
        content = insertImagesAtPlaceholders(content, imageHTMLs, imagePlaceholders);
        logger.info('이미지를 지정된 위치에 삽입했습니다', { 
          placeholders: imagePlaceholders.length,
          images: imageHTMLs.length 
        });
      } else {
        // 이미지 위치 마커가 없는 경우 기존 방식으로 처리
        const titleTagRegex = /<h1>(.*?)<\/h1>/i;
        const hasTitle = titleTagRegex.test(content);
        
        if (hasTitle) {
          content = content.replace(titleTagRegex, match => {
            return match + imageHTMLs.map(img => img.html).join('');
          });
        } else {
          content = imageHTMLs.map(img => img.html).join('') + content;
        }
        
        logger.info('이미지를 콘텐츠 시작 부분에 삽입했습니다', { count: imageHTMLs.length });
      }
    }
    
    // 워드프레스 포스팅 (실제 포스팅 또는 테스트)
    let postResult;
    if (postData.targetPlatform === 'wordpress' && !postData.testMode) {
      // platformData 구성 및 API 타입 설정
      if (postData.platformData) {
        // apiType이 전송된 경우 해당 값 사용
        if (postData.apiType) {
          postData.platformData.apiType = postData.apiType;
          logger.info('포스팅에 사용할 API 타입 설정', { apiType: postData.apiType });
        }
      }
      
      try {
        logger.info('WordPress에 포스팅 시작');
        
        // 날짜 설정: 예약 또는 랜덤 최근 날짜
        let postDate = null;
        if (postData.scheduledAt) {
          postDate = new Date(postData.scheduledAt).toISOString();
          logger.info('예약 포스팅 날짜 설정', { scheduledAt: postDate });
        } else if (postData.randomDate) {
          postDate = getRandomRecentDate();
          logger.info('랜덤 과거 날짜 설정', { randomDate: postDate });
        }
        
        postResult = await postToWordPress(
          title, 
          content, 
          featuredImageId, 
          postData.platformData, 
          postDate
        );
        
        logger.info('WordPress 포스팅 성공', { postId: postResult.postId, postUrl: postResult.postUrl });
      } catch (postError) {
        logger.error('WordPress 포스팅 실패', { error: postError.message });
        return { success: false, error: `포스팅 실패: ${postError.message}` };
      }
    } else {
      // 테스트 모드 - 포스팅 없이 결과 반환
      logger.info('테스트 모드 - 실제 포스팅 생략');
      postResult = { 
        success: true,
        postId: 'test-' + Date.now(),
        postUrl: `https://example.com/test-post/${encodeURIComponent(transformedKeyword)}`
      };
    }
    
    // 성공적인 포스팅 기록
    await scheduler.recordPost();
    
    logger.info('포스팅 완료', { 
      keyword, 
      transformedKeyword,
      url: postResult.postUrl,
      sessionId: postSessionId
    });
    
    return { 
      success: true, 
      message: '포스팅이 성공적으로 완료되었습니다',
      postId: postResult.postId,
      finalPostUrl: postResult.postUrl,
      title: title,
      imageIncluded: imageAdded,
      transformedKeyword,
      sessionId: postSessionId
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

// 콘텐츠에서 이미지 위치 마커 추출
function extractImagePlaceholders(content) {
  const placeholders = [];
  let match;
  const regex = /<!-- IMAGE_PLACEHOLDER -->/g;
  
  while ((match = regex.exec(content)) !== null) {
    placeholders.push({
      index: match.index,
      marker: match[0]
    });
  }
  
  return placeholders;
}

// 이미지를 콘텐츠의, 지정된 위치에 삽입
function insertImagesAtPlaceholders(content, images, placeholders) {
  // 이미지가 없거나 플레이스홀더가 없으면 원래 콘텐츠 반환
  if (images.length === 0 || placeholders.length === 0) {
    return content;
  }
  
  // 이미지 HTML 배열 준비
  const imageHtmlArray = images.map(img => img.html);
  
  // 결과 콘텐츠 조각들
  const contentPieces = [];
  
  // 마지막으로 처리한 위치
  let lastIndex = 0;
  
  // 각 플레이스홀더 위치에 이미지 삽입
  for (let i = 0; i < placeholders.length; i++) {
    const placeholder = placeholders[i];
    
    // 현재 위치까지의 콘텐츠 추가
    contentPieces.push(content.substring(lastIndex, placeholder.index));
    
    // 현재 위치에 이미지 추가 (순환하며 사용)
    const imageIndex = i % imageHtmlArray.length;
    contentPieces.push(imageHtmlArray[imageIndex]);
    
    // 다음 위치 설정 (플레이스홀더 마커 길이만큼 건너뛰기)
    lastIndex = placeholder.index + placeholder.marker.length;
  }
  
  // 남은 콘텐츠 추가
  contentPieces.push(content.substring(lastIndex));
  
  // 결합하여 반환
  return contentPieces.join('');
}

// 최근 날짜 중 랜덤으로 선택 (지난 7일 내)
function getRandomRecentDate() {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 7); // 0-6일 전
  const hoursAgo = Math.floor(Math.random() * 24); // 0-23시간 전
  
  now.setDate(now.getDate() - daysAgo);
  now.setHours(now.getHours() - hoursAgo);
  
  return now.toISOString();
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