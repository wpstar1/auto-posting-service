const mongoose = require('mongoose');
const schedule = require('node-schedule');

let Post, Image;
try {
  Post = mongoose.model('Post');
  Image = mongoose.model('Image');
} catch (error) {
  Post = require('../models/Post');
  Image = require('../models/Image');
}

class PostScheduler {
  constructor() {
    this.job = null;
  }

  // 스케줄러 시작
  start() {
    if (this.job) {
      this.stop();
    }

    // 매 분마다 실행
    this.job = schedule.scheduleJob('* * * * *', async () => {
      try {
        const posts = await Post.findDueScheduledPosts();
        
        for (const post of posts) {
          await this.processPost(post);
        }
      } catch (error) {
        console.error('포스트 처리 오류:', error);
      }
    });

    console.log('포스팅 스케줄러가 시작되었습니다');
  }

  // 스케줄러 정지
  stop() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log('포스팅 스케줄러가 정지되었습니다');
    }
  }

  // 포스트 처리
  async processPost(post) {
    try {
      // 랜덤 이미지 처리
      if (post.useRandomImages && post.randomImageTags?.length > 0) {
        const randomImages = await Image.aggregate([
          {
            $match: {
              userId: post.userId._id,
              tags: { $in: post.randomImageTags }
            }
          },
          { $sample: { size: post.randomImageCount } }
        ]);

        // 이미지 사용 횟수 증가
        await Promise.all(
          randomImages.map(img => Image.findByIdAndUpdate(
            img._id,
            {
              $inc: { usageCount: 1 },
              $set: { lastUsed: new Date() }
            }
          ))
        );

        post.images = randomImages.map(img => img._id);
      }

      // TODO: WordPress API를 사용하여 실제 포스팅 구현
      // 임시로 성공으로 처리
      const success = true;

      if (success) {
        post.status = 'published';
        post.publishedAt = new Date();
        post.error = null;
      } else {
        post.status = 'failed';
        post.error = '포스팅 실패';
      }

      await post.save();
    } catch (error) {
      console.error('포스트 처리 중 오류:', error);
      post.status = 'failed';
      post.error = error.message;
      await post.save();
    }
  }
}

module.exports = new PostScheduler();
