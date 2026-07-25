const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const phieuchamdiemSchema = new Schema({
    year: Number,
    id_cuocchamdiem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "QuanlyNamChamdiem"
    },
    chotdiemtucham: {
        status: Boolean,
        files: [String],
        time: {
            type: Date
        }
    }, //quanr tri he thong moi co quyen chinh sua
    chotdiemgiaitrinh: { // chốt điểm giải trình các nội dung cần làm rõ
        status: Boolean,
        files: [String],
        time: {
            type: Date
        }
    }, //quanr tri he thong moi co quyen chinh sua
    taikhoan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users"
    },
    phieuchamdiem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PhieudiemNew"
    },
    phieuchamdiem_detail: [],
    diemthuongtucham: Number,
    diemthuong: Number,
    ghichudiemthuong: {
        ghichucuadonvi: String,
        ghichucuathamdinh: String,
        files: [String], //  files  de kiem chung
    },
    ghichudiemthuonggiaitrinh: {
        ghichucuadonvi: String,
        ghichucuathamdinh: String,
        files: [String], //  files  de kiem chung
    },
    diemthuongthamdinhlan2: Number,
    diemphattucham: Number,
    ghichudiemphat: {
        ghichucuadonvi: String,
        ghichucuathamdinh: String,
        files: [String], //  files  de kiem chung
    },
    ghichudiemphatgiaitrinh: {
        ghichucuadonvi: String,
        ghichucuathamdinh: String,
        files: [String], //  files  de kiem chung
    },
    diemphat: Number,
    diemphatthamdinhlan2: Number,
    yeucaugiaitrinhdiemthuong: Boolean,
    yeucaugiaitrinhdiemphat: Boolean,
    diemphattoida: Number,
    diemthuongtoida: Number,
    tongdiemtucham: Number,
    tongdiemthamdinhlan1: Number,
    tongdiemthamdinhlan2: Number
}, { timestamps: true });

const Phieuchamdiems = mongoose.model('Phieuchamdiems', phieuchamdiemSchema);

module.exports = Phieuchamdiems;