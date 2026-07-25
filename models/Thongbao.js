const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const thongbao = new Schema({
    title: String,
    noidung: String,
    files: [{
        text: String,
        link: String
    }]
}, { timestamps: true });

const Thongbao = mongoose.model('Thongbao', thongbao);

module.exports = Thongbao;