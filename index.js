const express = require('express');
const app = express();
const https = require('https');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv').config();
const cookies = require("cookie-parser");
const bodyParser = require('body-parser')
const docx = require('docx');
app.use(cookies());
const fs = require("fs");
const { exec } = require("child_process");
const { execFile } = require('child_process');
// Hàm dùng chung: kiểm tra targetPath có thực sự nằm trong baseDir hay không
function isInsideBaseDir(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

app.use(function (req, res, next) {
    // res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(cors({
    // origin: "*",
    origin: ["http://localhost:5173", "https://localhost:4000", "http://192.168.1.103"],
    credentials: true,
}));
// app.use(express.json());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
const port = process.env.port || 5000;


const caicachhanhchinhRoute = require('./routes/caicachhanhchinh');
const authRoute = require('./routes/auth');
const caicachRoute = require('./routes/updatecaicach');

app.use('/auth', authRoute);
app.use('/cham-diem', caicachhanhchinhRoute);
app.use('/cchc', caicachRoute);

const path = require("path");
const basePath = '';

// app.use(express.static(path.join(__dirname, '/upload')));
app.use('/upload', express.static(path.join(__dirname, 'upload')));
app.use('/signatures', express.static(path.join(__dirname, 'signatures')));


// function convertDocxToPdf(docxPath) {
//   return new Promise((resolve, reject) => {
//     // Làm sạch và kiểm tra đường dẫn an toàn
//     const safeDocxPath = path.resolve(docxPath);
//     const outputDir = path.dirname(safeDocxPath);
    
//     const libreOfficePath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
//     const args = ['--headless', '--convert-to', 'pdf', safeDocxPath, '--outdir', outputDir];

//     // Dùng execFile truyền mảng args để chống Command Injection
//     execFile(libreOfficePath, args, (error, stdout, stderr) => {
//       if (error) {
//         console.error("Convert PDF Error:", stderr || error.message);
//         return reject(error);
//       }

//       const pdfPath = safeDocxPath.replace(/\.docx$/i, ".pdf");

//       if (!fs.existsSync(pdfPath)) {
//         return reject(new Error("Không tạo được file PDF"));
//       }

//       resolve(pdfPath);
//     });
//   });
// }

function convertDocxToPdf(docxPath) {
  return new Promise((resolve, reject) => {
    // Thư mục gốc được phép chứa mọi file docx của ứng dụng (bao gồm mọi
    // thư mục con theo id_user). Chỉ cần file nằm trong đây là hợp lệ.
    const uploadBaseDir = path.resolve(__dirname, "../upload");
 
    // Làm sạch và chuẩn hóa đường dẫn như code gốc
    const safeDocxPath = path.resolve(docxPath);
    const outputDir = path.dirname(safeDocxPath);
 
    // Rào chắn bảo vệ: file phải nằm trong uploadBaseDir (chặn path traversal)
    // Dùng path.relative thay vì startsWith để tránh bị bypass bởi thư mục
    // trùng tiền tố (vd "upload-backup")
    if (!isInsideBaseDir(uploadBaseDir, safeDocxPath)) {
      return reject(new Error('Đường dẫn file không hợp lệ'));
    }
 
    if (!fs.existsSync(safeDocxPath)) {
      return reject(new Error('File không tồn tại'));
    }
 
    const libreOfficePath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
    const args = ['--headless', '--convert-to', 'pdf', safeDocxPath, '--outdir', outputDir];
 
    // Dùng execFile truyền mảng args để chống Command Injection
    execFile(libreOfficePath, args, (error, stdout, stderr) => {
      if (error) {
        console.error("Convert PDF Error:", stderr || error.message);
        return reject(error);
      }
 
      const pdfPath = safeDocxPath.replace(/\.docx$/i, ".pdf");
 
      if (!fs.existsSync(pdfPath)) {
        return reject(new Error("Không tạo được file PDF"));
      }
 
      resolve(pdfPath);
    });
  });
};


app.get("/preview/:id_user/:fileName", async (req, res) => {
  try {
    const { id_user, fileName } = req.params;
 
    // 0. Validate id_user đúng định dạng ObjectId (phòng thủ thêm, vì id_user
    //    quyết định tên thư mục con chứa file)
    if (!mongoose.Types.ObjectId.isValid(id_user)) {
      return res.status(400).json({ message: "id_user không hợp lệ" });
    }
 
    // 1. Làm sạch tham số đầu vào bằng path.basename để loại bỏ mọi ký tự điều hướng (../, ..\)
    const safeUserId = path.basename(id_user);
    const safeFileName = path.basename(fileName);
 
    const ext = path.extname(safeFileName).toLowerCase();
 
    // 2. Xác định thư mục upload gốc chuẩn, và thư mục con của user (đã kiểm soát)
    const uploadBaseDir = path.resolve(__dirname, "upload");
    const userDir = path.resolve(uploadBaseDir, safeUserId);
 
    // 3. Tạo đường dẫn tuyệt đối tới file cần xử lý
    const filePath = path.resolve(userDir, safeFileName);
 
    // 4. Rào chắn bảo vệ: dùng path.relative thay vì startsWith
    //    (startsWith bị bypass bởi thư mục trùng tiền tố, vd "upload-backup")
    if (!isInsideBaseDir(uploadBaseDir, filePath)) {
      return res.status(403).json({
        message: "Truy cập không hợp lệ"
      });
    }
 
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Không tìm thấy file"
      });
    }
 
    // PDF mở trực tiếp
    if (ext === ".pdf") {
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(safeFileName)}"`
      );
 
      // Dùng { root } thay vì truyền thẳng absolute path — thêm 1 lớp
      // phòng thủ của chính Express khi resolve file
      return res.sendFile(safeFileName, { root: userDir });
    }
 
    // DOCX => PDF
    if (ext === ".docx") {
      const pdfFileName = safeFileName.replace(/\.docx$/i, ".pdf");
      const pdfPath = path.resolve(userDir, pdfFileName);
 
      let needConvert = false;
 
      // chưa có pdf
      if (!fs.existsSync(pdfPath)) {
        needConvert = true;
      } else {
        // docx mới hơn pdf thì convert lại
        const docxTime = fs.statSync(filePath).mtimeMs;
        const pdfTime = fs.statSync(pdfPath).mtimeMs;
 
        if (docxTime > pdfTime) {
          needConvert = true;
        }
      }
 
      if (needConvert) {
        // convertDocxToPdf giữ nguyên chữ ký gốc: nhận full path,
        // tự validate path traversal bên trong hàm
        await convertDocxToPdf(filePath);
      }
 
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(pdfFileName)}"`
      );
 
      return res.sendFile(pdfFileName, { root: userDir });
    }
 
    return res.status(400).json({
      message: "Định dạng file không hỗ trợ preview"
    });
 
  } catch (error) {
    console.error("Lỗi preview file:", error);
 
    return res.status(500).json({
      message: "Lỗi preview file"
    });
  }
});

const { cronjob_file } = require('./controllers/cronjob');
const Phieuchamdiems = require('./models/Phieuchamdiem');
// const options = {
//   key: fs.readFileSync('server.key'), // Đường dẫn tới file key
//   cert: fs.readFileSync('server.crt') // Đường dẫn tới file cert
// }
// app.listen(port, () => {
app.listen(4000, () => {
    console.log('server running ', port)
});

mongoose.set('strictQuery', true);
mongoose.connect(process.env.URL_MONGODB, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}, (err) => {
    if (err) {
        console.log(err)
    }
    console.log('kết nối db thành công')
})
