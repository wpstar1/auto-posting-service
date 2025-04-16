const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class WordPressService {
    constructor(platform) {
        this.platform = platform;
        this.baseUrl = platform.url.endsWith('/')
            ? platform.url + 'wp-json/wp/v2'
            : platform.url + '/wp-json/wp/v2';
    }

    // 인증 헤더 생성
    getAuthHeader() {
        const token = Buffer.from(`${this.platform.username}:${this.platform.getDecryptedPassword()}`).toString('base64');
        return `Basic ${token}`;
    }

    // 연결 테스트
    async testConnection() {
        try {
            console.log('연결 테스트 시도:', this.baseUrl);
            const response = await axios.get(this.baseUrl + '/users/me', {
                headers: {
                    'Authorization': this.getAuthHeader()
                }
            });

            console.log('연결 테스트 응답:', response.data);

            if (response.data && response.data.id) {
                return {
                    success: true,
                    message: '연결 테스트 성공'
                };
            }

            return {
                success: false,
                message: '사용자 정보를 가져올 수 없습니다.'
            };
        } catch (error) {
            console.error('WordPress 연결 테스트 실패:', {
                status: error.response?.status,
                data: error.response?.data,
                error: error.message
            });
            return {
                success: false,
                message: error.response?.data?.message || '연결에 실패했습니다. URL과 계정 정보를 확인해주세요.'
            };
        }
    }

    // 포스트 작성
    async createPost(title, content, status = 'publish', images = []) {
        try {
            console.log('포스트 작성 시도:', { title, status });
            
            // 1. 이미지 업로드
            const mediaIds = [];
            for (const image of images) {
                const mediaId = await this.uploadMedia(image);
                if (mediaId) {
                    mediaIds.push(mediaId);
                }
            }

            // 2. 포스트 데이터 준비
            const postData = {
                title,
                content,
                status,
                featured_media: mediaIds[0] || 0  // 첫 번째 이미지를 대표 이미지로
            };

            console.log('포스트 데이터:', postData);

            // 3. 포스트 생성
            const response = await axios.post(this.baseUrl + '/posts', postData, {
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json'
                }
            });

            console.log('포스트 작성 성공:', response.data);

            return {
                success: true,
                post: response.data
            };
        } catch (error) {
            console.error('포스트 작성 실패:', {
                status: error.response?.status,
                data: error.response?.data,
                error: error.message
            });
            return {
                success: false,
                message: error.response?.data?.message || '포스트 작성에 실패했습니다.'
            };
        }
    }

    // 미디어(이미지) 업로드
    async uploadMedia(imageFile) {
        try {
            const formData = new FormData();
            formData.append('file', fs.createReadStream(imageFile.path));

            const response = await axios.post(this.baseUrl + '/media', formData, {
                headers: {
                    'Authorization': this.getAuthHeader(),
                    ...formData.getHeaders()
                }
            });

            return response.data.id;
        } catch (error) {
            console.error('이미지 업로드 실패:', error.response?.data || error.message);
            return null;
        }
    }

    // 포스트 수정
    async updatePost(postId, title, content, status = 'publish', images = []) {
        try {
            // 1. 새 이미지 업로드
            const mediaIds = [];
            for (const image of images) {
                const mediaId = await this.uploadMedia(image);
                if (mediaId) {
                    mediaIds.push(mediaId);
                }
            }

            // 2. 포스트 데이터 준비
            const postData = {
                title,
                content,
                status
            };

            if (mediaIds.length > 0) {
                postData.featured_media = mediaIds[0];
            }

            // 3. 포스트 수정
            const response = await axios.put(`${this.baseUrl}/posts/${postId}`, postData, {
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                post: response.data
            };
        } catch (error) {
            console.error('포스트 수정 실패:', error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || '포스트 수정에 실패했습니다.'
            };
        }
    }

    // 포스트 삭제
    async deletePost(postId) {
        try {
            await axios.delete(`${this.baseUrl}/posts/${postId}`, {
                headers: {
                    'Authorization': this.getAuthHeader()
                }
            });

            return {
                success: true,
                message: '포스트가 삭제되었습니다.'
            };
        } catch (error) {
            console.error('포스트 삭제 실패:', error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || '포스트 삭제에 실패했습니다.'
            };
        }
    }
}

module.exports = WordPressService;
