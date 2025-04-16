const nodemailer = require('nodemailer');
require('dotenv').config();

class Notifier {
  constructor() {
    this.enabled = process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true';
    this.transporter = null;
    
    // 노드메일러 트랜스포터 초기화
    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    }
  }

  async sendInfoNotification(subject, htmlContent) {
    if (!this.enabled || !this.transporter) {
      console.log('이메일 알림이 비활성화되어 있습니다:', subject);
      return false;
    }
    
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: `[정보] ${subject}`,
        html: htmlContent
      };
      
      const info = await this.transporter.sendMail(mailOptions);
      console.log('이메일 알림 전송 성공:', info.messageId);
      return true;
    } catch (error) {
      console.error('이메일 알림 전송 실패:', error);
      return false;
    }
  }

  async sendErrorNotification(subject, errorData) {
    if (!this.enabled || !this.transporter) {
      console.log('이메일 알림이 비활성화되어 있습니다:', subject);
      return false;
    }
    
    try {
      let errorHtml = `
        <h2>오류 알림: ${subject}</h2>
        <p><strong>시간:</strong> ${new Date().toLocaleString()}</p>
      `;
      
      if (errorData) {
        errorHtml += '<h3>오류 세부 정보:</h3><pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px;">';
        
        if (typeof errorData === 'string') {
          errorHtml += errorData;
        } else if (errorData.error && errorData.stack) {
          errorHtml += `${errorData.error}\n\n${errorData.stack}`;
        } else {
          errorHtml += JSON.stringify(errorData, null, 2);
        }
        
        errorHtml += '</pre>';
      }
      
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: `[에러] ${subject}`,
        html: errorHtml
      };
      
      const info = await this.transporter.sendMail(mailOptions);
      console.log('에러 알림 이메일 전송 성공:', info.messageId);
      return true;
    } catch (error) {
      console.error('에러 알림 이메일 전송 실패:', error);
      return false;
    }
  }
}

const notifier = new Notifier();

module.exports = {
  notifier
}; 