const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const configPhieucham = new Schema({
    phieuchamdiem: [{
        linhvuc: {
            text: String,
            diemtoida: Number,
            thutu: Number,
            diemtucham: Number,
            diemthamdinhlan1: Number,
            diemthamdinhlan2: Number,
        },
        tieuchi_group: [{
            tieuchi: {
                text: String,
                diemtoida: Number,
                thutu: Number,
                diemtucham: Number,
                diemthamdinhlan1: Number,
                diemthamdinhlan2: Number,
            },
            tieuchithanhphan_group: [{
                text: String,
                diemtoida: Number,
                thutu: Number,
                noidungthangdiem: String,
                ghichu: String,
                successtucham: Boolean,
                successgiaitrinh: Boolean,
                yeucaugiaitrinh: Boolean,
                diemtuchamlan1: Number,
                diemthamdinhlan1: Number,
                diemthamdinhlan2: Number,
                ghichucuadonvilan1: String,
                ghichucuathamdinh1: String,
                ghichucuadonvilan2: String,
                ghichucuathamdinh2: String,
                files: [String], //  files  de kiem chung
                files_bosung: [String], //  files  de kiem chung bổ sung
                diem_tinh_theo_cong_thuc: Boolean,
                bieu_thuc_toan_hoc: {
                    bien_su_dung: [{
                        title: String,
                        variable: String,
                        value: Number, // giá trị biến của người dùng tự chấm
                        value_thamdinh_lan1: Number,
                        value_thamdinh_lan2: Number
                    }], // danh sách các biến sử dụng ví dụ x,y ,z
                    cong_thuc: [{
                        text: String,
                        phep_tinh_display: String, // biểu thức toán học hiển thị
                        phep_tinh_cal: String, // biểu thức toán học để tính toán
                        choice: Boolean,
                        condition: String,
                        choice_thamdinh_lan1: Boolean,
                        choice_thamdinh_lan2: Boolean
                    }],
                }
            }]
        }]
    }],
    name: String,
    user_created: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users"
    }
}, { timestamps: true });

const PhieudiemNew = mongoose.model('PhieudiemNew', configPhieucham);

module.exports = PhieudiemNew;