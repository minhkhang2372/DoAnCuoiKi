const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
    },
    debug: true,
    logger: true
});

transporter.verify(function(error, success) {
    if (error) {
        console.error('Email service error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

async function sendOTP(email, otp) {
    try {
        // Đọc template HTML
        const templatePath = path.join(__dirname, '../views/emails/otp-template.html');
        let htmlContent = await fs.readFile(templatePath, 'utf8');
        
        // Thay thế placeholder với OTP
        htmlContent = htmlContent.replace('{{otp}}', otp);

        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Xác nhận đăng ký tài khoản',
            html: htmlContent
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}

async function sendPasswordReset(email, resetLink) {
    try {
        // Đọc template HTML
        const templatePath = path.join(__dirname, '../views/emails/reset-password-template.html');
        let htmlContent = await fs.readFile(templatePath, 'utf8');
        
        // Thay thế placeholder với reset link
        htmlContent = htmlContent.replace(/{{resetLink}}/g, resetLink);

        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Đặt lại mật khẩu',
            html: htmlContent
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw error;
    }
}

async function sendNewsletterConfirmation(email, confirmLink) {
    try {
        console.log('Preparing to send newsletter confirmation to:', email);
        
        // Đọc template HTML
        const templatePath = path.join(__dirname, '../views/emails/newsletter-template.html');
        let htmlContent = await fs.readFile(templatePath, 'utf8');
        
        // Thay thế placeholder với confirm link
        htmlContent = htmlContent.replace(/{{confirmLink}}/g, confirmLink);

        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Xác nhận đăng ký nhận tin từ CheckPrice',
            html: htmlContent
        };

        console.log('Sending email with options:', mailOptions);

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info);
        return info;
    } catch (error) {
        console.error('Error sending newsletter confirmation email:', error);
        throw error;
    }
}

module.exports = {
    sendOTP,
    sendPasswordReset,
    sendNewsletterConfirmation
}; 