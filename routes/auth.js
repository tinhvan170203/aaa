const express = require('express');

const router = express.Router();
const fs = require('fs');
const multer = require('multer');
const path = require('path');
// --- CẤU HÌNH MULTER ĐỂ LƯU FILE ---

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './signatures/';
        // Tự động tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Đặt tên file: UNIQUE_ID-thoigian-tenfilegoc.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Bộ lọc chỉ cho phép up file ảnh
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file hình ảnh!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 } // Giới hạn 5MB
});

const auth = require('../controllers/auth');
const middlewareController = require('../middlewares/verifyToken');
const checkRole = require('../middlewares/checkRole');
// const middlewareController = require('../middlewares/verifyToken');

router.post('/login', auth.login )
router.post('/change-pass',  auth.changePassword )
router.post('/logout',  auth.logout)
router.post('/requestRefreshToken', auth.requestRefreshToken)
//route tạo tài khoản cấp bộ, cục, tỉnh
router.get('/user/fetch',middlewareController.verifyToken, auth.getUserList)
router.post('/user/add', middlewareController.verifyToken, auth.addUser)
router.post('/user/change-many-status', middlewareController.verifyToken, auth.changeStatusAccounts)
router.delete('/user/delete/:id',middlewareController.verifyToken, auth.deleteUser)
router.put('/user/edit/:id', middlewareController.verifyToken,  auth.editUser)


//route tạo tài khoản cấp phòng, xã của công an cấp tỉnh
router.get('/user/cap-tinh/fetch',middlewareController.verifyToken, auth.getUserListOfCapTinh)
router.post('/user/cap-tinh/add', middlewareController.verifyToken, auth.addUserOfCapTinh)
router.post('/user/cap-tinh/change-many-status', middlewareController.verifyToken, auth.changeStatusAccountsOfCapTinh)
router.delete('/user/cap-tinh/delete/:id',middlewareController.verifyToken, auth.deleteUserOfCapTinh)
router.put('/user/cap-tinh/edit/:id', middlewareController.verifyToken,  auth.editUserOfCapTinh)

//route lấy ra các tài khoản cấp tỉnh 
router.get('/user/list/cap-tinh/fetch',middlewareController.verifyToken, auth.getUserCapTinh)
router.get('/user/nhom-chuc-nang',middlewareController.verifyToken, auth.getNhomchucnang)

//lấy ra user cấp con của 1 user
router.get('/user/children',middlewareController.verifyToken, auth.fetchChildrenUser)

// hàm liên quan đến ký số
router.get('/document-assets/:userId', middlewareController.verifyToken, auth.getSignatureImg);
router.post('/document-assets/upload/:userId', upload.single('image'), middlewareController.verifyToken, auth.uploadSignatureImg)
module.exports = router