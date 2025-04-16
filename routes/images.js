const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const { protect } = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const router = express.Router();
const sharp = require('sharp');

let Image;
try {
  Image = mongoose.model('Image');
} catch (error) {
  Image = require('../models/Image');
}

// 이미지 목록 조회
router.get('/', protect, async (req, res) => {
  try {
    const { tags, sort = '-createdAt' } = req.query;
    let query = { userId: req.user.id };

    // 태그 필터링
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      query.tags = { $in: tagArray };
    }

    const images = await Image.find(query)
      .sort(sort)
      .select('-path'); // 보안을 위해 실제 파일 경로는 제외

    res.json({
      success: true,
      images: images.map(img => ({
        id: img._id,
        filename: img.filename,
        originalname: img.originalname,
        mimetype: img.mimetype,
        size: img.size,
        tags: img.tags,
        usageCount: img.usageCount,
        lastUsed: img.lastUsed,
        createdAt: img.createdAt
      }))
    });
  } catch (error) {
    console.error('이미지 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 이미지 업로드
router.post('/', protect, upload.array('images', 5), async (req, res) => {
  try {
    const { tags } = req.body;
    let tagArray = [];
    
    // 태그를 처리하고 키워드 매칭을 위해 정제
    if (tags) {
      tagArray = tags.split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0);
    }

    // 사용자 레벨에 따른 이미지 제한 설정
    const maxImagesAllowed = req.user.level === 'vip' ? 5 : 1;
    
    // 현재 이미지 개수 확인
    const count = await Image.countDocuments({ userId: req.user.id });
    
    // 이미지 제한 검사
    if (count + req.files.length > maxImagesAllowed) {
      // 업로드된 파일 삭제
      for (const file of req.files) {
        await fs.unlink(file.path);
      }
      
      return res.status(403).json({
        success: false,
        error: `${req.user.level === 'vip' ? 'VIP' : 'Level 1'} 사용자는 최대 ${maxImagesAllowed}개의 이미지만 저장할 수 있습니다.`
      });
    }

    // 이미지 정보 저장 및 압축 처리
    const savedImages = await Promise.all(
      req.files.map(async file => {
        // 이미지 압축 처리
        const compressedImagePath = path.join(
          path.dirname(file.path),
          'compressed_' + file.filename
        );
        
        // sharp로 이미지 압축
        await sharp(file.path)
          .resize(1200, null, { withoutEnlargement: true }) // 최대 가로 크기 1200px로 제한
          .jpeg({ quality: 80 }) // JPEG 품질 80%로 설정
          .toFile(compressedImagePath);
          
        // 원본 이미지 삭제하고 압축된 이미지를 사용
        await fs.unlink(file.path);
        await fs.rename(compressedImagePath, file.path);
        
        // 이미지 메타데이터 저장
        return Image.create({
          userId: req.user.id,
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path,
          tags: tagArray,
          keywords: tagArray // 키워드 매칭을 위한 필드 추가
        });
      })
    );

    res.status(201).json({
      success: true,
      images: savedImages.map(img => ({
        id: img._id,
        filename: img.filename,
        originalname: img.originalname,
        mimetype: img.mimetype,
        size: img.size,
        tags: img.tags,
        createdAt: img.createdAt
      }))
    });
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
    // 업로드된 파일 삭제
    if (req.files) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(() => {});
      }
    }
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 이미지 조회 (파일 스트림)
router.get('/:id/view', protect, async (req, res) => {
  try {
    const image = await Image.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!image) {
      return res.status(404).json({
        success: false,
        error: '이미지를 찾을 수 없습니다'
      });
    }

    res.sendFile(image.path);
  } catch (error) {
    console.error('이미지 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 이미지 태그 수정
router.put('/:id/tags', protect, async (req, res) => {
  try {
    const { tags } = req.body;
    const tagArray = tags ? tags.split(',').map(tag => tag.trim()) : [];

    const image = await Image.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id
      },
      { $set: { tags: tagArray } },
      { new: true }
    );

    if (!image) {
      return res.status(404).json({
        success: false,
        error: '이미지를 찾을 수 없습니다'
      });
    }

    res.json({
      success: true,
      image: {
        id: image._id,
        filename: image.filename,
        originalname: image.originalname,
        tags: image.tags,
        updatedAt: image.updatedAt
      }
    });
  } catch (error) {
    console.error('태그 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 이미지 삭제
router.delete('/:id', protect, async (req, res) => {
  try {
    const image = await Image.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!image) {
      return res.status(404).json({
        success: false,
        error: '이미지를 찾을 수 없습니다'
      });
    }

    // 파일 삭제
    await fs.unlink(image.path);
    
    // DB에서 삭제
    await image.deleteOne();

    res.json({
      success: true,
      message: '이미지가 삭제되었습니다'
    });
  } catch (error) {
    console.error('이미지 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

// 랜덤 이미지 선택
router.get('/random', protect, async (req, res) => {
  try {
    const { tags, count = 1 } = req.query;
    let query = { userId: req.user.id };

    // 태그 필터링
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      query.tags = { $in: tagArray };
    }

    // 랜덤으로 이미지 선택
    const images = await Image.aggregate([
      { $match: query },
      { $sample: { size: parseInt(count) } }
    ]);

    if (images.length === 0) {
      return res.status(404).json({
        success: false,
        error: '조건에 맞는 이미지가 없습니다'
      });
    }

    // 사용 횟수 증가
    await Promise.all(
      images.map(img => Image.findByIdAndUpdate(
        img._id,
        {
          $inc: { usageCount: 1 },
          $set: { lastUsed: new Date() }
        }
      ))
    );

    res.json({
      success: true,
      images: images.map(img => ({
        id: img._id,
        filename: img.filename,
        originalname: img.originalname,
        tags: img.tags
      }))
    });
  } catch (error) {
    console.error('랜덤 이미지 선택 오류:', error);
    res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다'
    });
  }
});

module.exports = router;
