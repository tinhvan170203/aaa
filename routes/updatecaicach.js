const express = require('express');
const path = require('path')
const multer = require('multer')

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, path.join(__dirname,`../upload`))
    },
    filename: function(req, file, cb) {
        const originalName = file.originalname; // tên file gốc
        const encodedName = Buffer.from(originalName, 'latin1').toString('utf8'); // mã hóa tên file
        // cb(null, encodedName); // dùng tên file đã mã hóa
        cb(null, + new Date() + '_' + encodedName)
    }
});

const upload = multer({
    storage: storage,
});

// SỬA DÒNG NÀY: Ép định dạng lưu trữ vào RAM để có thuộc tính req.file.buffer
const storage1 = multer.memoryStorage();
const upload1 = multer({ storage: storage1 });

const router = express.Router();
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');
const updatecaicach = require('../controllers/updatecaicach');

router.get('/fetch',middlewareController.verifyToken, updatecaicach.getPhieuchams);
router.post('/add',middlewareController.verifyToken, updatecaicach.savePhieudiemConfig);
router.post('/copy',middlewareController.verifyToken, updatecaicach.copyPhieuchamConfig);
router.post('/update',middlewareController.verifyToken, updatecaicach.updatePhieuchamConfig);
router.get('/cuoc-cham-diem/fetch',middlewareController.verifyToken, updatecaicach.getListCuocchamdiem);
router.post('/cuoc-cham-diem/add',middlewareController.verifyToken, updatecaicach.createdCuocchamdiem);
router.delete('/cuoc-cham-diem/delete/:id',middlewareController.verifyToken, updatecaicach.deleteCuocChamDiem);

router.put('/cuoc-cham-diem/edit/:id',middlewareController.verifyToken, updatecaicach.updateCuocChamDiem);
router.get('/change-block-tu-cham',middlewareController.verifyToken, updatecaicach.changeStatusChotdiemTucham);
router.get('/change-block-giai-trinh',middlewareController.verifyToken, updatecaicach.changeStatusChotdiemGiaitrinh);
router.get('/theo-doi-qua-trinh-cham-diem',middlewareController.verifyToken, updatecaicach.theodoiQuatrinhCham);
router.get('/xoa-phieu-cham-diem/:id',middlewareController.verifyToken, updatecaicach.removePhieucham);

router.get('/xep-hang-diem-so',middlewareController.verifyToken, updatecaicach.xepHangDiemso);
router.get('/xep-hang-diem-don-vi-cap-3',middlewareController.verifyToken, updatecaicach.xepHangDiemCaNuocDonviCap3);
router.get('/check-phieu-cham-used',middlewareController.verifyToken, updatecaicach.checkPhieuchamUsed);
router.get('/xep-hang-linh-vuc',middlewareController.verifyToken, updatecaicach.xepHangTheoLinhvuc);
router.get('/xep-hang-tieu-chi',middlewareController.verifyToken, updatecaicach.xepHangTheoTieuchi);

router.get('/thong-bao', updatecaicach.fetchThongbao);
router.post('/save-thong-bao', updatecaicach.saveThongbao);
router.post('/save-file',middlewareController.verifyToken, upload.single('file'), updatecaicach.saveFile);
router.post('/save-ghi-chu',middlewareController.verifyToken, updatecaicach.updateGhichuFile);
router.get('/thong-bao/delete/:id',middlewareController.verifyToken, updatecaicach.deleteFile);
router.get('/download-file/login/:file', updatecaicach.downloadFileLoginPage);

// sửa để tài khoản V03 cấu hình cho các tài khoản con thẩm định bảng điểm của công an các đơn vị, địa phương

router.get('/fetch-user-cho-checkbox',middlewareController.verifyToken, updatecaicach.fetchUserCapTinhCuc);
router.get('/fetch-tai-khoan-tham-dinh',middlewareController.verifyToken, updatecaicach.fetchUserRoleThamdinh);
router.post('/check-import', middlewareController.verifyToken, updatecaicach.checkImportUser);
router.post('/save-cau-hinh/:id', middlewareController.verifyToken, updatecaicach.saveUserRoleThamdinh);
router.get('/fetch-danh-sach-tham-dinh',middlewareController.verifyToken, updatecaicach.fetchThamdinhTheoUserRole);
router.delete('/mau-phieu-cham-diem/delete/:id',middlewareController.verifyToken, updatecaicach.deletePhieuCham);
router.get('/test',middlewareController.verifyToken, updatecaicach.test);

//sửa 2026

// hàm lấy ra danh sách tài khoản đang active của user cha
router.get('/user-con/list', middlewareController.verifyToken, updatecaicach.getListDonviConfigChamdiem)
router.get('/check-update-cuoc-cham-diem', middlewareController.verifyToken, updatecaicach.checkedEditCuocchamdiem)
// hàm lấy ra danh sách các phiếu điểm sử dụng trong năm để làm tiêu chí lấy kết quả theo phiếu
router.get('/list-phieu-cham-used-nam-cham-diem', middlewareController.verifyToken, updatecaicach.fetchMauphieuUsedNamchamdiem)

//hàm upload và convert docx thành pdf
router.post('/documents/convert-docx-to-pdf', upload1.single('wordFile'), middlewareController.verifyToken,  updatecaicach.uploadAndConvertDocxToPdf)

//hàm upload file trả về sau khi ký số thành công
router.post('/documents/upload-signed-base64',middlewareController.verifyToken,  updatecaicach.uploadResultAfterSignature)

//hàm update phiếu điểm khi có file ký số
router.post('/save-file-signature/:id', middlewareController.verifyToken, updatecaicach.saveFileSignature)
module.exports = router