const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const quantrichamdiemSchema = new Schema({
    user_created: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users"
    },
    nam: {
        type: Number,
        // unique: true
    },
    title: {
        type: String
    },
    viewThamdinhlan1: Boolean,
    viewThamdinhlan2: Boolean,
    wordThamdinhlan1: Boolean,
    wordThamdinhlan2: Boolean,
    setting: [{
        accounts: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Users"
        }],
        phieucham: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PhieudiemNew"
        }
    }],
    ketthuctuchamdiem: Boolean, // trạng thái fales là sẽ tự động khóa tự chấm
    ketthucthoigiangiaitrinh: Boolean,
    thoigianbatdautucham: Date,
    thoigianhethantuchamdiem: Date,
    thoigianhethangiaitrinh: Date,
    thoigianhethanthamdinhlan1: Date,
    thoigianhethanthamdinhlan2: Date,
    diemthuongtoida: Number,
    diemphattoida: Number,
    diemtuchamtoida: Number,
    trangthai: Boolean //
}, { timestamps: true });


const QuantriNamChamdiem = mongoose.model('QuantriNamChamdiem', quantrichamdiemSchema);

module.exports = QuantriNamChamdiem;