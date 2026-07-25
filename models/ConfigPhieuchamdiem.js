const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const configPhieucham = new Schema({
    phieuchamdiem: [{
        linhvuc: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Linhvucs"
        },
        diemtoidalinhvuc: Number,
        tieuchi_group: [{
            tieuchi: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Tieuchis"
            },
            tieuchithanhphan: [{
                tieuchithanhphan: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Tieuchithanhphans"
                },
                diemtucham: Number,
                diemthamdinh: Number,
                ghichucuadonvi: String,
                ghichucuathamdinh: String,
                files: [String], //  files  de kiem chung
            }]
        }]
    }],
   name: String
}, { timestamps: true });

const ConfigPhieuchamdiem = mongoose.model('ConfigPhieuchamdiem', configPhieucham);

module.exports = ConfigPhieuchamdiem;