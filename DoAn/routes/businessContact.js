const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');

// Cấu hình multer với tên file tùy chỉnh
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Đổi tên thư mục từ 'uploads' thành 'uploadsDoiTac'
        if (!fs.existsSync('uploadsDoiTac')) {
            fs.mkdirSync('uploadsDoiTac');
        }
        cb(null, 'uploadsDoiTac/');
    },
    filename: function (req, file, cb) {
        const businessName = req.body.businessName || 'unknown';
        const taxCode = req.body.taxCode || 'unknown';
        
        // Xử lý tên file: thay thế các ký tự không hợp lệ và khoảng trắng
        const sanitizedName = businessName.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = Date.now();
        
        const fileName = `${sanitizedName}_${taxCode}_${timestamp}${path.extname(file.originalname)}`;
        cb(null, fileName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file Excel (.xlsx, .xls)'));
        }
    }
});

// Cấu hình Google Sheets API
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = '1qEqgF5hMSnQOXmgYbR8NjzIkz_RIr_WhmxdZMoLAnVs';

router.post('/', upload.single('productList'), async (req, res) => {
    console.log('POST request received at /api/business-contact');
    console.log('Request body:', req.body);
    
    try {
        const {
            businessName,
            taxCode,
            contactPerson,
            phone,
            email,
            website,
            message
        } = req.body;

        let productData = [];
        let fileName = 'Không có file';
        
        // Xử lý file Excel nếu có
        if (req.file) {
            fileName = path.basename(req.file.path);
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            productData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        }

        // Chuẩn bị dữ liệu với tên file (không có đường dẫn)
        const values = [[
            new Date().toLocaleString('vi-VN'),
            businessName,
            taxCode,
            contactPerson,
            phone,
            email,
            website || 'N/A',
            message || 'N/A',
            fileName
        ]];

        // Ghi thông tin cơ bản vào sheet chính
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:I',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: values
            },
        });

        // Nếu có dữ liệu sản phẩm, tạo sheet mới và ghi vào
        if (productData.length > 0) {
            try {
                // Tạo sheet mới cho từng yêu cầu
                const sheetTitle = `${businessName.substring(0, 20)}_${taxCode}`;
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SPREADSHEET_ID,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: sheetTitle
                                }
                            }
                        }]
                    }
                });

                // Ghi dữ liệu vào sheet mới
                const productValues = productData.map(product => Object.values(product));
                const headers = Object.keys(productData[0]);
                
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetTitle}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    resource: {
                        values: [
                            [`Doanh nghiệp: ${businessName}`, `Mã số thuế: ${taxCode}`, `Ngày: ${new Date().toLocaleString('vi-VN')}`],
                            headers,
                            ...productValues
                        ]
                    },
                });
            } catch (sheetError) {
                console.error('Error creating/updating product sheet:', sheetError);
            }
        }

        res.json({ 
            success: true, 
            message: 'Đã nhận thông tin thành công!' 
        });

    } catch (error) {
        console.error('Detailed error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra khi xử lý thông tin',
            error: error.message 
        });
    }
});

module.exports = router; 