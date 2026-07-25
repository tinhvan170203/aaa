
const Phieuchamdiems = require("../models/Phieuchamdiem");
const PhieudiemNew = require("../models/PhieudiemNew");
const QuantriNamChamdiem = require("../models/QuanlyNamChamdiem");
const Users = require("../models/Users");
const path = require('path');
const fs = require('fs');
const Thongbao = require("../models/Thongbao");
const HistoriesSystem = require("../models/HistoriesSystem");
const Joi = require('joi');
const { addAbortListener } = require("events");
const saveAction = async (user_id, action) => {
    let newAction = new HistoriesSystem({
        user: user_id,
        action: action
    })
    await newAction.save();
};

const libre = require('libreoffice-convert');
libre.convertAsync = require('util').promisify(libre.convert);

// Hàm dùng chung: kiểm tra targetPath có thực sự nằm trong baseDir hay không
function isInsideBaseDir(baseDir, targetPath) {
    const relative = path.relative(baseDir, targetPath);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

module.exports = {
    getPhieuchams: async (req, res) => {
        let { id_user, captaikhoan } = req.query;
        const schema = Joi.object({
            id_user: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            id_user
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };
        try {
            let items = [];
            if (captaikhoan === "Cấp Tỉnh") {
                let phieu1 = await PhieudiemNew.find({ user_created: value.id_user }).sort({ createdAt: -1 }).lean();
                items = items.concat(phieu1);
                let users = await Users.find({ taikhoancap: "Cấp Bộ" });
                for (let user of users) {
                    let phieu2 = await PhieudiemNew.find({ user_created: user._id }).sort({ createdAt: -1 }).lean();
                    // console.log(phieu2)
                    items = items.concat(phieu2)
                };
                res.status(200).json(items);
            } else {
                items = await PhieudiemNew.find({ user_created: value.id_user }).sort({ createdAt: -1 }).lean();
                res.status(200).json(items);
            }
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },

    savePhieudiemConfig: async (req, res) => {
        try {
            let item = new PhieudiemNew(req.body);
            await item.save();
            await saveAction(req.userId.userId, `Cấu hình phiếu chấm điểm ${req.body.name}`)
            res.status(200).json({ message: "Tạo phiếu chấm điểm thành công" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },

    copyPhieuchamConfig: async (req, res) => {
        let id = req.body.id;
        let captaikhoan = req.body.captaikhoan;
        try {
            let item = await PhieudiemNew.findById(id);

            let data = {
                name: item.name + " Copy",
                phieuchamdiem: item.phieuchamdiem,
                user_created: req.userId.userId
            };
            let copy = new PhieudiemNew(data);
            await copy.save();
            await saveAction(req.userId.userId, `Nhân bản phiếu chấm điểm ${item.name}`)
            let items = [];
            if (captaikhoan === "Cấp Tỉnh") {
                let phieu1 = await PhieudiemNew.find({ user_created: req.userId.userId }).sort({ createdAt: -1 });
                items = items.concat(phieu1);
                let users = await Users.find({ taikhoancap: "Cấp Bộ" });
                for (let user of users) {
                    let phieu2 = await PhieudiemNew.find({ user_created: user._id }).sort({ createdAt: -1 });
                    // console.log(phieu2)
                    items = items.concat(phieu2)
                };

            } else {
                items = await PhieudiemNew.find({ user_created: req.userId.userId }).sort({ createdAt: -1 });

            }
            // let items = await PhieudiemNew.find({ user_created: item.user_created }).sort({ createdAt: -1 });
            res.status(200).json({ items, message: "Nhân bản phiếu chấm điểm thành công" });
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },

    updatePhieuchamConfig: async (req, res) => {
        let id = req.body.id;
        let id_user = req.body.data.id_user
        // console.log(req.body.data)
        const schema = Joi.object({
            id_user: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            id_user
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };
        try {
            await PhieudiemNew.findByIdAndUpdate(id, req.body.data);
            // console.log(id_user)
            let items = await PhieudiemNew.find({ user_created: value.id_user }).sort({ createdAt: -1 });
            // console.log(items)
            await saveAction(req.userId.userId, `Cấu hình phiếu chấm điểm ${req.body.data.name}`)
            res.status(200).json({ items, message: "Update phiếu chấm điểm thành công" });
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },

    // hàm tạo cuộc chấm điểm trong năm
    createdCuocchamdiem: async (req, res) => {
        let data = req.body;
        // console.log(data)
        const schema = Joi.object({
            user_created: Joi.string().required(),
            nam: Joi.number().required(),
        });

        const { error, value } = schema.validate({
            user_created: req.body.user_created,
            nam: Number(req.body.nam),
        });
        if (error) {
            console.log(error.message)
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };
        try {
            // check xem đã có  cuộc chấm điểm năm muốn tạo của user đã tạo chưa
            let check = await QuantriNamChamdiem.findOne({
                nam: value.nam,
                user_created: value.user_created
            });

            if (check !== null) {
                return res.status(401).json({
                    status: "failed",
                    message: "Có lỗi xảy ra do đã có cuộc chấm điểm năm của đơn vị trong hệ thống. Vui lòng xem lại danh sách cuộc chấm điểm",
                });
            };

            let item = new QuantriNamChamdiem(data)
            await item.save();
            let items = await QuantriNamChamdiem.find({ user_created: value.user_created }).populate('setting.phieucham', { name: 1 }).sort({ nam: -1 })
            await saveAction(req.userId.userId, `Tạo cuộc chấm điểm năm ${req.body.nam}`)
            res.status(200).json({ items, message: "Tạo cuộc chấm điểm thành công" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },

    getListCuocchamdiem: async (req, res) => {
        let { id_user } = req.query;
        const schema = Joi.object({
            id_user: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            id_user
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };
        try {
            let items = await QuantriNamChamdiem.find({ user_created: value.id_user }).populate('setting.phieucham', { name: 1 }).sort({ nam: -1 });
            res.status(200).json(items)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },
    deleteCuocChamDiem: async (req, res) => {
        let { id } = req.params;
        try {
            let item = await QuantriNamChamdiem.findById(id);
            let list_id_phieucham = [];
            let id_user = item.user_created;
            item.setting.forEach(i => list_id_phieucham.push(i.phieucham));

            //xóa hết phiếu tự chấm điểm có các phiếu chấm thuộc danh sách đã cấu hình cho cuocj chấm điểm
            //xóa hết các file đã tải lên của user đã chấm điểm
            let phieuchamdiems_da_cham = await Phieuchamdiems.find({ phieuchamdiem: { $in: list_id_phieucham } }).lean()
            for (let phieucham of phieuchamdiems_da_cham) {
                let all_files = [];
                let phieuchamdiem_detail = phieucham.phieuchamdiem_detail;
                for (let detail of phieuchamdiem_detail) {
                    detail.tieuchi_group.forEach(tieuchi => {
                        tieuchi.tieuchithanhphan_group.forEach(thanhphan => {
                            all_files = all_files.concat(thanhphan.files).concat(thanhphan.files_bosung)
                        });
                    })
                };

                let taikhoan = phieucham.taikhoan.toString();

                all_files = all_files.concat(phieucham.ghichudiemthuong.files)
                    .concat(phieucham.ghichudiemphat.files)
                    .concat(phieucham.ghichudiemphatgiaitrinh.files)
                    .concat(phieucham.ghichudiemthuonggiaitrinh.files);


                for (let i of all_files) {
                    let path_delete = path.join(__dirname, `../upload/${taikhoan}/` + i);
                    if (fs.existsSync(path_delete)) {
                        fs.unlinkSync(path.join(__dirname, `../upload/${taikhoan}/` + i));
                        console.log(`The file ${path_delete} exists.`);
                    } else {
                        console.log(`The file ${path_delete} does not exist.`);
                    }
                };
            };

            if (list_id_phieucham.length > 0 && list_id_phieucham <= 300) {
                await Phieuchamdiems.deleteMany({
                    phieuchamdiem: { $in: list_id_phieucham }
                });

            };

            await QuantriNamChamdiem.findByIdAndDelete(id);
            await saveAction(req.userId.userId, `Xóa cuộc chấm điểm năm ${item.nam}`)
            let items = await QuantriNamChamdiem.find({ user_created: id_user }).populate('setting.phieucham', { name: 1 }).sort({ nam: -1 })
            res.status(200).json({ items, message: "Xóa cuộc chấm điểm thành công" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },
    updateCuocChamDiem: async (req, res) => {
        let { id } = req.params;
        // console.log(id)
        try {
            let item = await QuantriNamChamdiem.findByIdAndUpdate(id, req.body);

            let items = await QuantriNamChamdiem.find({ user_created: item.user_created }).populate('setting.phieucham', { name: 1 }).sort({ nam: -1 }).lean()
            await saveAction(req.userId.userId, `Update cuộc chấm điểm năm ${req.body.nam}`)
            res.status(200).json({ items, message: "Update cuộc chấm điểm thành công" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },

    changeStatusChotdiemTucham: async (req, res) => {
        // console.log('123')
        let { id_phieucham } = req.query;
        try {
            let phieucham = await Phieuchamdiems.findById(id_phieucham).populate('taikhoan');
            phieucham.chotdiemtucham.status = !phieucham.chotdiemtucham.status;
            // console.log(phieucham.chotdiemtucham.status)
            await phieucham.save();
            await saveAction(req.userId.userId, `Thay đổi trạng thái chốt điểm tự chấm phiếu chấm điểm ${phieucham.taikhoan.tenhienthi} năm ${phieucham.year}`)
            res.status(200).json({ message: "Thay đổi trạng thái tự chấm điểm thành công" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },
    changeStatusChotdiemGiaitrinh: async (req, res) => {
        let { id_phieucham } = req.query;
        try {
            let phieucham = await Phieuchamdiems.findById(id_phieucham).populate('taikhoan');
            phieucham.chotdiemgiaitrinh.status = !phieucham.chotdiemgiaitrinh.status;
            await phieucham.save();
            await saveAction(req.userId.userId, `Thay đổi trạng thái chốt điểm giải trình phiếu chấm điểm ${phieucham.taikhoan.tenhienthi} năm ${phieucham.year}`)
            res.status(200).json({ message: "Thay đổi trạng thái tự giải trình điểm giải trình thành công" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra. Vui lòng liên hệ quản trị viên",
            });
        }
    },

    theodoiQuatrinhCham: async (req, res) => {
        let { id_user, year } = req.query;
        const schema = Joi.object({
            id_user: Joi.string().required(),
            year: Joi.number().required(),
        });

        const { error, value } = schema.validate({
            id_user: id_user,
            year: year,
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };
        let cuocChamDiem = await QuantriNamChamdiem.findOne({ user_created: value.id_user, nam: value.year });
        if (cuocChamDiem === null) {
            return res.status(401).json({ status: "failed", message: "Chưa có cuộc chấm điểm năm " + year });
        }
        try {
            let items = await Users.find({ capcha: value.id_user, role: { $ne: true } }, { _id: 1, tenhienthi: 1, time_block: 1, status: 1, nhom: 1, taikhoancap: 1 }).sort({ thutu: 1 });
            // console.log(items)
            // tìm ra các user yêu cầu chấm điểm năm đó
            items = items.filter(e => {
                let date_start_chamdiem = (new Date(cuocChamDiem.thoigianbatdautucham)).getTime();
                let date_block_user = e.status === true ? (new Date(e.time_block)).getTime() : (new Date()).getTime()
                let check = (e.status === false && date_start_chamdiem > date_block_user)
                return e.status === true || check
            });

            //lọc qua các user để lấy ra trạng thái quá trình chấm điểm
            let data = [];

            for (let user of items) {
                // tìm xem đã có phiếu tự chấm điểm chưa, nếu chưa có thì chưa chấm điểm
                let phieuchamdiem_of_user = await Phieuchamdiems.findOne({
                    taikhoan: user._id,
                    year: value.year
                });

                if (phieuchamdiem_of_user === null) {
                    //TH chưa tự chấm điểm
                    data.push({
                        user: user,
                        status_chotdiemtucham: false,
                        status_chotdiemgiaitrinh: false,
                        time_chotdiemtucham: null,
                        time_chotdiemgiaitrinh: null,
                        id_phieucham: null
                    })
                } else {
                    data.push({
                        user: user,
                        id_phieucham: phieuchamdiem_of_user._id,
                        status_chotdiemtucham: phieuchamdiem_of_user.chotdiemtucham.status,
                        status_chotdiemgiaitrinh: phieuchamdiem_of_user.chotdiemgiaitrinh.status,
                        time_chotdiemtucham: phieuchamdiem_of_user.chotdiemgiaitrinh.status === true ?
                            phieuchamdiem_of_user.chotdiemtucham.time : null,
                        time_chotdiemgiaitrinh: phieuchamdiem_of_user.chotdiemgiaitrinh.status === true ?
                            phieuchamdiem_of_user.chotdiemgiaitrinh.time : null,
                    })
                }
            };

            res.status(200).json(data)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    removePhieucham: async (req, res) => {
        let id = req.params.id; // id phiếu chấm muốn xóa
        try {
            // xóa tất cả các file đã tải lên trong phiếu chấm đó
            let phieucham = await Phieuchamdiems.findById(id);
            let all_files = [];
            let phieuchamdiem_detail = phieucham.phieuchamdiem_detail;
            for (let detail of phieuchamdiem_detail) {
                detail.tieuchi_group.forEach(tieuchi => {
                    tieuchi.tieuchithanhphan_group.forEach(thanhphan => {
                        all_files = all_files.concat(thanhphan.files).concat(thanhphan.files_bosung)
                    });
                })
            };

            let taikhoan = phieucham.taikhoan.toString();

            all_files = all_files.concat(phieucham.ghichudiemthuong.files)
                .concat(phieucham.ghichudiemphat.files)
                .concat(phieucham.ghichudiemphatgiaitrinh.files)
                .concat(phieucham.ghichudiemthuonggiaitrinh.files);


            for (let i of all_files) {
                let path_delete = path.join(__dirname, `../upload/${taikhoan}/` + i);
                if (fs.existsSync(path_delete)) {
                    fs.unlinkSync(path.join(__dirname, `../upload/${taikhoan}/` + i));
                    console.log(`The file ${path_delete} exists.`);
                } else {
                    console.log(`The file ${path_delete} does not exist.`);
                }
            };

            await Phieuchamdiems.findByIdAndRemove(id);
            res.status(200).json({ message: "Xóa phiếu chấm điểm thành công" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    xepHangDiemso: async (req, res) => {
        let { id_user, year } = req.query;
        const schema = Joi.object({
            id_user: Joi.string().required(),
            year: Joi.number().required(),
        });

        const { error, value } = schema.validate({
            id_user: id_user,
            year: year,
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };
        let cuocChamDiem = await QuantriNamChamdiem.findOne({ user_created: value.id_user, nam: value.year });
        if (cuocChamDiem === null) {
            return res.status(401).json({ status: "failed", message: "Chưa có cuộc chấm điểm năm " + year });
        };


        try {
            let items = await Users.find({ capcha: value.id_user, role: { $ne: true } }, { _id: 1, tenhienthi: 1, time_block: 1, status: 1, nhom: 1, taikhoancap: 1 }).sort({ thutu: 1 });
            // console.log(items)
            // tìm ra các user yêu cầu chấm điểm năm đó
            items = items.filter(e => {
                let date_start_chamdiem = (new Date(cuocChamDiem.thoigianbatdautucham)).getTime();
                let date_block_user = e.status === true ? (new Date(e.time_block)).getTime() : (new Date()).getTime()
                let check = (e.status === false && date_start_chamdiem > date_block_user)
                return e.status === true || check
            });

            //lọc qua các user để lấy ra dữ liệu
            let data = [];
            let phieuchamdiem_of_users = await Phieuchamdiems.find({
                taikhoan: { $in: items.map(i => i._id) },
                year: value.year
            }).populate('taikhoan', { tenhienthi: 1 });

            for (let phieuchamdiem_of_user of phieuchamdiem_of_users) {
                // tìm xem đã có phiếu tự chấm điểm chưa, nếu chưa có thì chưa chấm điểm
                // let phieuchamdiem_of_user = await Phieuchamdiems.findOne({
                //     taikhoan: user._id,
                //     year: value.year
                // });

                if (phieuchamdiem_of_user === null) {
                    //TH chưa tự chấm điểm
                    // console.log('chưa chấm')
                    continue;
                    // data.push({
                    //     user: user,
                    //     nhomchucnang: "", // chính là id_phieudiem sử dụng
                    //     phieucham: null,
                    //     diemtucham: 0,
                    //     diemthamdinhlan1: 0,
                    //     diemthamdinhlan2: 0
                    // })
                } else {
                    let list = phieuchamdiem_of_user.phieuchamdiem_detail;

                    let total_diemtucham = 0;
                    let total_diemthamdinhlan1 = 0;
                    let total_diemthamdinhlan2 = 0;
                    for (let i of list) {
                        //check xem lĩnh vực nào được sử dụng cho cấp, cho năm
                        let total_diemtuchamlinhvuc = 0;
                        let total_diemthamdinhlinhvuc = 0;
                        let total_diemthamdinhlinhvuclan2 = 0;

                        //lọc qua từng tiêu chí của  lĩnh vực đẻ tính điểm cho lĩnh vực
                        let tieuchiList = [];
                        for (let tieuchi of i.tieuchi_group) {
                            let total_diemtuchamtieuchi = 0;
                            let total_diemthamdinhtieuchi = 0;
                            let total_diemthamdinhtieuchilan2 = 0;


                            //lọc qua từng tiêu chí thành phần để tính điểm của tiêu chí
                            for (let tieuchithanhphan of tieuchi.tieuchithanhphan_group) {
                                total_diemtuchamtieuchi += tieuchithanhphan.diemtuchamlan1;
                                total_diemthamdinhtieuchi += tieuchithanhphan.diemthamdinhlan1;
                                total_diemthamdinhtieuchilan2 += tieuchithanhphan.diemthamdinhlan2;

                                total_diemtuchamlinhvuc += tieuchithanhphan.diemtuchamlan1;
                                total_diemthamdinhlinhvuc += tieuchithanhphan.diemthamdinhlan1;
                                total_diemthamdinhlinhvuclan2 += tieuchithanhphan.diemthamdinhlan2;
                            };

                            tieuchiList.push({
                                tieuchithanhphan_group: tieuchi.tieuchithanhphan_group,
                                tieuchi: {
                                    text: tieuchi.tieuchi.text,
                                    diemtoida: tieuchi.tieuchi.diemtoida,
                                    thutu: tieuchi.tieuchi.thutu,
                                    diemtucham: total_diemtuchamtieuchi,
                                    diemthamdinhlan1: total_diemthamdinhtieuchi,
                                    diemthamdinhlan2: total_diemthamdinhtieuchilan2,
                                },
                                _id: tieuchi._id
                            });
                        };

                        total_diemtucham += total_diemtuchamlinhvuc;
                        total_diemthamdinhlan1 += total_diemthamdinhlinhvuc;
                        total_diemthamdinhlan2 += total_diemthamdinhlinhvuclan2;
                    };

                    total_diemtucham += phieuchamdiem_of_user.diemthuongtucham - phieuchamdiem_of_user.diemphattucham;
                    total_diemthamdinhlan1 += phieuchamdiem_of_user.diemthuong - phieuchamdiem_of_user.diemphat;
                    total_diemthamdinhlan2 += phieuchamdiem_of_user.diemthuongthamdinhlan2 - phieuchamdiem_of_user.diemphatthamdinhlan2;

                    data.push({
                        taikhoan: phieuchamdiem_of_user.taikhoan,
                        diemtucham: total_diemtucham,
                        phieucham: phieuchamdiem_of_user.phieuchamdiem_detail,
                        nhomchucnang: phieuchamdiem_of_user.phieuchamdiem,
                        diemthamdinhlan1: total_diemthamdinhlan1,
                        diemthamdinhlan2: total_diemthamdinhlan2,
                        maxScore: cuocChamDiem.diemtuchamtoida + cuocChamDiem.diemthuongtoida
                    });
                }
            };
            // console.log(data.length)
            data = data.sort((a, b) => b.diemthamdinhlan2 - a.diemthamdinhlan2)
            res.status(200).json({ data, total_users: items.length, total_users_chuacham: items.length - data.length })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    xepHangDiemCaNuocDonviCap3: async (req, res) => {
        let { year, id } = req.query;
        console.log(req.query)
        const schema = Joi.object({
            year: Joi.number().required(),
            id: Joi.any(),
        });

        const { error, value } = schema.validate({
            year: year,
            id
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };
        // console.log(id)
        try {
            let users_cap_tinh = [];
            // lấy ra danh sách các tài khoản cấp Tỉnh sử dụng hết năm year
            if (id === '') {
                users_cap_tinh = await Users.find({
                    taikhoancap: "Cấp Tỉnh"
                }, { tenhienthi: 1, time_block: 1, status: 1 }).lean();
            } else {
                users_cap_tinh = await Users.find({
                    taikhoancap: "Cấp Tỉnh",
                    _id: id
                }, { tenhienthi: 1, time_block: 1, status: 1 }).lean();
            }

            users_cap_tinh = users_cap_tinh.filter(e => {
                let date_start_chamdiem = (new Date(`${year}-12-31T23:59:59.527Z`)).getTime();
                let date_block_user = e.status === true ? (new Date(e.time_block)).getTime() : (new Date()).getTime()
                let check = (e.status === false && date_start_chamdiem > date_block_user)
                return e.status === true || check
            });

            let data = [];
            let users_cap_xa = await Users.find({ capcha: { $in: users_cap_tinh.map(i => i._id.toString()) }, taikhoancap: "Cấp Xã", status: true }, { _id: 1, tenhienthi: 1, time_block: 1, status: 1, nhom: 1, taikhoancap: 1 }).sort({ thutu: 1 }).lean();
            // tìm xem đã có phiếu tự chấm điểm chưa, nếu chưa có thì chưa chấm điểm
            let phieuchamdiem_of_users = await Phieuchamdiems.find({
                taikhoan: { $in: users_cap_xa.map(i => i._id.toString()) },
                year: value.year
            }).populate('taikhoan', { tenhienthi: 1 }).populate({
                path: "taikhoan",
                populate: { path: "capcha", select: "tenhienthi" }
            }).lean();

            for (let phieuchamdiem_of_user of phieuchamdiem_of_users) {
                let list = phieuchamdiem_of_user.phieuchamdiem_detail;
                let total_diemtucham = 0;
                let total_diemthamdinhlan1 = 0;
                let total_diemthamdinhlan2 = 0;
                for (let i of list) {
                    //check xem lĩnh vực nào được sử dụng cho cấp, cho năm
                    let total_diemtuchamlinhvuc = 0;
                    let total_diemthamdinhlinhvuc = 0;
                    let total_diemthamdinhlinhvuclan2 = 0;

                    //lọc qua từng tiêu chí của  lĩnh vực đẻ tính điểm cho lĩnh vực
                    let tieuchiList = [];
                    for (let tieuchi of i.tieuchi_group) {
                        let total_diemtuchamtieuchi = 0;
                        let total_diemthamdinhtieuchi = 0;
                        let total_diemthamdinhtieuchilan2 = 0;

                        //lọc qua từng tiêu chí thành phần để tính điểm của tiêu chí
                        for (let tieuchithanhphan of tieuchi.tieuchithanhphan_group) {
                            total_diemtuchamtieuchi += tieuchithanhphan.diemtuchamlan1;
                            total_diemthamdinhtieuchi += tieuchithanhphan.diemthamdinhlan1;
                            total_diemthamdinhtieuchilan2 += tieuchithanhphan.diemthamdinhlan2;

                            total_diemtuchamlinhvuc += tieuchithanhphan.diemtuchamlan1;
                            total_diemthamdinhlinhvuc += tieuchithanhphan.diemthamdinhlan1;
                            total_diemthamdinhlinhvuclan2 += tieuchithanhphan.diemthamdinhlan2;
                        };

                        tieuchiList.push({
                            tieuchithanhphan_group: tieuchi.tieuchithanhphan_group,
                            tieuchi: {
                                text: tieuchi.tieuchi.text,
                                diemtoida: tieuchi.tieuchi.diemtoida,
                                thutu: tieuchi.tieuchi.thutu,
                                diemtucham: total_diemtuchamtieuchi,
                                diemthamdinhlan1: total_diemthamdinhtieuchi,
                                diemthamdinhlan2: total_diemthamdinhtieuchilan2,
                            },
                            _id: tieuchi._id
                        });
                    };

                    total_diemtucham += total_diemtuchamlinhvuc;
                    total_diemthamdinhlan1 += total_diemthamdinhlinhvuc;
                    total_diemthamdinhlan2 += total_diemthamdinhlinhvuclan2;
                };

                total_diemtucham += phieuchamdiem_of_user.diemthuongtucham - phieuchamdiem_of_user.diemphattucham;
                total_diemthamdinhlan1 += phieuchamdiem_of_user.diemthuong - phieuchamdiem_of_user.diemphat;
                total_diemthamdinhlan2 += phieuchamdiem_of_user.diemthuongthamdinhlan2 - phieuchamdiem_of_user.diemphatthamdinhlan2;

                data.push({
                    taikhoan: phieuchamdiem_of_user.taikhoan.tenhienthi,
                    donvi: phieuchamdiem_of_user.taikhoan.capcha.tenhienthi,
                    diemtucham: total_diemtucham,
                    diemthamdinhlan1: total_diemthamdinhlan1,
                    diemthamdinhlan2: total_diemthamdinhlan2
                });
            };

            data = data.sort((a, b) => b.diemthamdinhlan2 - a.diemthamdinhlan2);
            res.status(200).json({ data, list: users_cap_tinh, total_users_xa: users_cap_xa.length, total_users_xa_chuacham: users_cap_xa.length - data.length })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    checkPhieuchamUsed: async (req, res) => {
        let id_phieucham = req.query.id_phieucham;
        const schema = Joi.object({
            id_phieucham: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            id_phieucham: id_phieucham,
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };
        try {
            let check_nam_cham_diem_used = await QuantriNamChamdiem.find({
                "setting.phieucham": value.id_phieucham
            });

            let check = false;
            if (check_nam_cham_diem_used.length > 0) {
                check = true
            };
            res.status(200).json(check)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    fetchThongbao: async (req, res) => {
        try {
            let item = await Thongbao.findOne();
            if (item === null) {
                let newItem = new Thongbao({
                    title: "",
                    noidung: "",
                    files: []
                });
                await newItem.save();
                return res.status(200).json(newItem)
            };
            res.status(200).json(item)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    saveThongbao: async (req, res) => {
        try {
            let thongbao = await Thongbao.findOne();
            thongbao.title = req.body.title;
            thongbao.noidung = req.body.noidung;
            await thongbao.save();
            res.status(200).json({ message: "Lưu thông báo thành công" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    saveFile: async (req, res) => {
        let index = req.file.path.lastIndexOf('\\');
        let link = req.file.path.slice(index + 1)
        try {
            let thongbao = await Thongbao.findOne();
            thongbao.files.push({ text: req.body.text, link })
            await thongbao.save();
            res.status(200).json(thongbao.files)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    updateGhichuFile: async (req, res) => {
        let id = req.body.id;
        try {
            let thongbao = await Thongbao.findOne();
            thongbao.files = thongbao.files.map(e => {
                if (e._id.toString() === id) {
                    return ({
                        ...e,
                        text: req.body.text
                    })
                } else {
                    return e
                }
            })
            await thongbao.save();
            res.status(200).json(thongbao.files)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    deleteFile: async (req, res) => {
        const { id } = req.params;
        const { file } = req.query;

        try {
            if (!file) {
                return res.status(400).json({ status: "failed", message: "Thiếu thông tin file cần xóa" });
            }

            let thongbao = await Thongbao.findOne();
            if (!thongbao) {
                return res.status(404).json({ status: "failed", message: "Không tìm thấy thông báo" });
            }

            thongbao.files = thongbao.files.filter(e => e._id.toString() !== id);

            // 1. Loại bỏ các ký tự phân cách thư mục khỏi file name
            const safeFileName = path.basename(String(file));

            // 2. Xác định đường dẫn thư mục upload tuyệt đối
            const uploadDir = path.resolve(__dirname, '../upload');

            // 3. Tạo đường dẫn tuyệt đối đến file
            const filePath = path.resolve(uploadDir, safeFileName);

            // 4. Rào chắn bảo vệ: Kiểm tra filePath có thực sự thuộc uploadDir không (Chống Path Traversal)
            if (filePath.startsWith(uploadDir) && filePath !== uploadDir) {
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                        console.log(`Đã xóa file: ${filePath}`);
                    } catch (err) {
                        console.error('Lỗi khi xóa file:', err);
                    }
                } else {
                    console.log('File không tồn tại:', filePath);
                }
            } else {
                console.warn('Phát hiện hành vi Path Traversal:', filePath);
            }

            await thongbao.save();
            return res.status(200).json(thongbao.files);

        } catch (error) {
            console.error("Lỗi deleteFile:", error);
            return res.status(500).json({ status: "failed", message: "Có lỗi xảy ra khi xóa file" });
        }
    },

    // downloadFileLoginPage: async (req, res) => {
    //     try {
    //       const { file } = req.params;

    //       if (!file) {
    //         return res.status(400).send("Thiếu tên file cần tải");
    //       }

    //       // 1. Loại bỏ hoàn toàn các ký tự điều hướng thư mục (../, ..\)
    //       const safeFileName = path.basename(String(file));

    //       // 2. Xác định thư mục upload gốc tuyệt đối
    //       const uploadDir = path.resolve(__dirname, "../upload");

    //       // 3. Tạo đường dẫn tuyệt đối đến file
    //       const path_file = path.resolve(uploadDir, safeFileName);

    //       // 4. Rào chắn bảo vệ: Kiểm tra file có nằm đúng trong thư mục upload hay không
    //       if (!path_file.startsWith(uploadDir) || path_file === uploadDir) {
    //         console.warn(`Phát hiện hành vi Path Traversal khi tải file đăng nhập: ${path_file}`);
    //         return res.status(403).send("Truy cập bị từ chối");
    //       }

    //       // 5. Kiểm tra sự tồn tại của file trước khi gửi
    //       if (!fs.existsSync(path_file)) {
    //         return res.status(404).send("File không tồn tại");
    //       }

    //       // 6. Thực hiện cho người dùng tải file xuống
    //       res.download(path_file, safeFileName, function (err) {
    //         if (err) {
    //           console.error("Lỗi khi tải file xuống:", err);
    //           if (!res.headersSent) {
    //             return res.status(500).send("Lỗi tải file");
    //           }
    //         } else {
    //           console.log("Tải file đăng nhập xuống thành công");
    //         }
    //       });

    //     } catch (error) {
    //       console.error("Lỗi downloadFileLoginPage:", error);
    //       if (!res.headersSent) {
    //         return res.status(500).send("Lỗi hệ thống");
    //       }
    //     }
    //   },
    downloadFileLoginPage: async (req, res) => {
        try {
            const { file } = req.params;

            if (!file) {
                return res.status(400).send("Thiếu tên file cần tải");
            }

            // 1. Loại bỏ hoàn toàn các ký tự điều hướng thư mục (../, ..\)
            const safeFileName = path.basename(String(file));

            // 2. Xác định thư mục upload gốc tuyệt đối
            const uploadDir = path.resolve(__dirname, "../upload");

            // 3. Tạo đường dẫn tuyệt đối đến file
            const path_file = path.resolve(uploadDir, safeFileName);

            // 4. Rào chắn bảo vệ: dùng path.relative thay vì startsWith
            //    (startsWith bị bypass bởi thư mục trùng tiền tố, vd "upload-backup")
            if (!isInsideBaseDir(uploadDir, path_file)) {
                console.warn(`Phát hiện hành vi Path Traversal khi tải file đăng nhập: ${file}`);
                return res.status(403).send("Truy cập bị từ chối");
            }

            // 5. Kiểm tra sự tồn tại của file trước khi gửi
            if (!fs.existsSync(path_file)) {
                return res.status(404).send("File không tồn tại");
            }

            // 6. Thực hiện cho người dùng tải file xuống
            // Dùng { root } thay vì absolute path trực tiếp — thêm 1 lớp phòng thủ
            // từ chính Express khi resolve file
            res.download(safeFileName, safeFileName, { root: uploadDir }, function (err) {
                if (err) {
                    console.error("Lỗi khi tải file xuống:", err);
                    if (!res.headersSent) {
                        return res.status(500).send("Lỗi tải file");
                    }
                } else {
                    console.log("Tải file đăng nhập xuống thành công");
                }
            });

        } catch (error) {
            console.error("Lỗi downloadFileLoginPage:", error);
            if (!res.headersSent) {
                return res.status(500).send("Lỗi hệ thống");
            }
        }
    },
    xepHangTheoLinhvuc: async (req, res) => {
        let { year, id_user, id_phieucham } = req.query;
        // console.log(req.query)
        const schema = Joi.object({
            year: Joi.number().required(),
            id_user: Joi.string().required(),
            id_phieucham: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            year: year,
            id_user: id_user,
            id_phieucham
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị year ' + error });
        };
        try {
            let items = await Phieuchamdiems.find({ year: value.year, phieuchamdiem: id_phieucham }).populate('taikhoan', { _id: 1, tenhienthi: 1 }).lean()

            let data = []
            for (let item of items) {
                let list = item.phieuchamdiem_detail;
                let data_linhvuc = []
                for (let i of list) {
                    data_linhvuc.push({
                        linhvuc: {
                            text: i.linhvuc.text,
                            diemtoida: i.linhvuc.diemtoida,
                            thutu: i.linhvuc.thutu,
                            diemtucham: i.linhvuc.diemtucham,
                            diemthamdinhlan1: i.linhvuc.diemthamdinhlan1,
                            diemthamdinhlan2: i.linhvuc.diemthamdinhlan2
                        },
                        _id: i._id
                    })
                };
                data.push({
                    user: item.taikhoan.tenhienthi,
                    linhvuc_group: data_linhvuc
                })
            };

            let linhvucList = [];
            if (data.length > 0) {
                data[0].linhvuc_group.forEach(i => linhvucList.push({ _id: i._id, text: i.linhvuc.text }))
            };
            res.status(200).json({ data, linhvucList })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },
    xepHangTheoTieuchi: async (req, res) => {
        let { year, id_user, id_phieucham } = req.query;

        const schema = Joi.object({
            year: Joi.number().required(),
            id_user: Joi.string().required(),
            id_phieucham: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            year: year,
            id_user: id_user,
            id_phieucham
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị year' });
        };
        try {
            let items = await Phieuchamdiems.find({ year: value.year, phieuchamdiem: id_phieucham }).populate('taikhoan', { _id: 1, tenhienthi: 1 })
            let tieuchiList = [];
            let data = []
            for (let item of items) {
                // console.log(item)
                let list = item.phieuchamdiem_detail;
                let data_tieuchi = []
                for (let i of list) {
                    for (let tieuchi of i.tieuchi_group) {
                        data_tieuchi.push({
                            tieuchi: {
                                text: tieuchi.tieuchi.text,
                                diemtoida: tieuchi.tieuchi.diemtoida,
                                thutu: tieuchi.tieuchi.thutu,
                                diemtucham: tieuchi.tieuchi.diemtucham,
                                diemthamdinhlan1: tieuchi.tieuchi.diemthamdinhlan1,
                                diemthamdinhlan2: tieuchi.tieuchi.diemthamdinhlan2
                            },
                            _id: i._id
                        })
                    };
                };

                data.push({
                    user: item.taikhoan.tenhienthi,
                    tieuchi_group: data_tieuchi
                });

                tieuchiList = data_tieuchi.map(i => ({
                    _id: i._id,
                    text: i.tieuchi.text
                }))
            };

            //     let linhvucList = [];
            // if(data.length > 0){
            //     data[0].linhvuc_group.forEach(i=> linhvucList.push({_id: i._id, text: i.linhvuc.text}))
            // };
            res.status(200).json({ data, linhvucList: tieuchiList })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    checkImportUser: async (req, res) => {
        let { data } = req.body;
        let userId = req.userId.userId;
        let nhom_list = [];
        let user;
        try {
            user = await Users.findOne({ _id: userId });
            let check_cap = user.taikhoancap;
            // console.log(check_cap)
            if (check_cap === "Cấp Bộ") {
                nhom_list = [
                    "Các đơn vị thuộc cơ quan Bộ có chức năng giải quyết TTHC cho cá nhân, tổ chức",
                    "Các đơn vị thuộc cơ quan Bộ không có chức năng giải quyết TTHC cho cá nhân, tổ chức",
                    "Công an cấp tỉnh"
                ]
            };
            if (check_cap === "Cấp Tỉnh") {
                nhom_list = [
                    "Phòng có chức năng giải quyết thủ tục hành chính",
                    "Phòng không có chức năng giải quyết thủ tục hành chính",
                    "Cấp Xã"
                ]
            };
        } catch (error) {
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }

        try {
            let i = 1;
            let err = false;
            let text = "";
            let id_list = [];

            for (let item of data) {
                let item_db = {
                    ...item,
                    matkhau: "123456",
                    status: true, capcha: user._id,
                    block_by_admin: false,
                    time_block: new Date()
                };

                const validation = new Users(item_db);
                //suawr tieep tap huan

                try {
                    fs.mkdirSync(
                        path.join(__dirname, `../upload/${validation._id}`)
                    );
                    console.log('Folder created successfully (sync)!');
                } catch (err) {
                    console.error('Error creating folder (sync):', err);
                };
                // await validation.save()
                id_list.push(validation._id);
                try {
                    await validation.validate() //kiểm tra xem có hợp lệ với model hay không
                    // console.log(user)
                    //check field taikhoancap. nếu được thêm từ cấp Bộ thì taikhoancap = Cấp Bộ || Cấp Tỉnh || Cấp Cục
                    // Cấp Tỉnh thì taikhoancap là Cấp Phòng, Cấp Xã
                    if (user.taikhoancap === "Cấp Bộ") {
                        let check_taikhoancap = item.taikhoancap === "Cấp Cục" || item.taikhoancap === "Cấp Tỉnh";
                        // console.log(check_taikhoancap)
                        if (!check_taikhoancap) {
                            err = true;
                            text = 'Dữ liệu không hợp lệ tại dòng thứ ' + i + ". Trường captaikhoan không hợp lệ. Vui lòng kiểm tra lại."
                            break;
                        };

                    };
                    if (user.taikhoancap === "Cấp Tỉnh") {
                        let check_taikhoancap = item.taikhoancap === "Cấp Phòng" || item.taikhoancap === "Cấp Xã";
                        console.log(check_taikhoancap)
                        if (!check_taikhoancap) {
                            err = true;
                            text = 'Dữ liệu không hợp lệ tại dòng thứ ' + i + ". Trường captaikhoan không hợp lệ. Vui lòng kiểm tra lại."
                            break;
                        };

                    };

                    //check nhóm theo chức năng chấm điểm của tài khoản

                    let check_nhom = nhom_list.includes(item.nhom);
                    if (!check_nhom) {
                        err = true;
                        text = 'Dữ liệu không hợp lệ tại dòng thứ ' + i + ". Trường nhom không hợp lệ. Vui lòng kiểm tra lại."
                        break;
                    };

                    i++;
                    await validation.save()

                } catch (error) {
                    let x = error.message
                    if (error.message.includes("E11000 duplicate key error collection: chamdiemcaicachBCA.users index")) {
                        x = error.message.replace('Chi tiết lỗi: E11000 duplicate key error collection: chamdiemcaicachBCA.users index', "Trùng giá trị đưa vào hệ thống tại trường:")
                    }
                    // console.error('Dữ liệu không hợp lệ tại dòng thứ ' + i +". Vui lòng kiểm tra lại file import theo đúng cấu trúc", error.message);
                    err = true;
                    text = 'Dữ liệu không hợp lệ tại dòng thứ ' + i + ". Vui lòng kiểm tra lại file import theo đúng cấu trúc" + x;
                    await Users.deleteMany({
                        _id: { $in: id_list }
                    });
                    break;
                }
            };

            if (err) {
                await Users.deleteMany({
                    _id: { $in: id_list }
                });

                for (let folderId of id_list) {
                    const folderPath = path.join(__dirname, "../upload/", folderId.toString());
                    try {
                        fs.rmdirSync(folderPath);
                        console.log('Folder removed successfully (sync)!');
                    } catch (err) {
                        console.error('Error removing folder (sync):', err);
                    }
                    return res.status(401).json({ status: "failed", message: "Import dữ liệu thất bại. Chi tiết lỗi: " + text });
                };
            }

            await saveAction(req.userId.userId, `Import danh sách tài khoản`)
            res.status(200).json({ message: "Import dữ liệu thành công!" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra. Vui lòng kiểm tra lại file import hoặc liên hệ quản trị hệ thống" });
        }
    },

    // fetch User có tài khoản cấp tỉnh, cục để chấm thẩm định của tài khoản có chức năng
    // thẩm định một số đơn vị, địa phương
    fetchUserCapTinhCuc: async (req, res) => {
        try {
            let items = [];
            let users = await Users.find({
                "taikhoancap": { $in: ["Cấp Cục", "Cấp Tỉnh"] },
                role: { $ne: true }
            }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });

            users = users.map(e => ({
                value: e._id,
                name: e.tenhienthi,
                thutu: e.thutu
            }));

            items.push({
                khoi: 'Chọn Tất cả',
                accounts: users
            });

            res.status(200).json(items)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    fetchUserRoleThamdinh: async (req, res) => {
        try {
            let users = await Users.find({
                "taikhoancap": { $in: ["Cấp Bộ"] },
                role: true
            }, { capcha: 1, danhsachthamdinh: 1, tenhienthi: 1, _id: 1 }).populate('capcha', { _id: 1, tenhienthi: 1, danhsachthamdinh: 1 }).populate('danhsachthamdinh').sort({ thutu: 1 });

            res.status(200).json(users);
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    saveUserRoleThamdinh: async (req, res) => {
        let id = req.params.id;
        try {
            await Users.findByIdAndUpdate(id, { danhsachthamdinh: req.body.data });

            res.status(200).json({ message: "Lưu cấu hình thành công" });
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    fetchThamdinhTheoUserRole: async (req, res) => {
        let { id_user, year } = req.query;
        const schema = Joi.object({
            id_user: Joi.string().required(),
            year: Joi.number().required(),
        });

        const { error, value } = schema.validate({
            id_user: id_user,
            year: year
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };

        let user = await Users.findById(value.id_user);

        // check xem có cuộc chấm điểm nào của tài khoản V03 không
        let cuocChamDiem = await QuantriNamChamdiem.findOne({ user_created: user.capcha, nam: value.year });
        if (cuocChamDiem === null) {
            return res.status(401).json({ status: "failed", message: "Chưa có cuộc chấm điểm năm " + year });
        }
        try {
            let danhsachthamdinh = user.danhsachthamdinh.map(i => i.toString())
            let items = await Users.find({ capcha: user.capcha, _id: { $ne: user._id }, role: { $ne: true }, _id: { $in: danhsachthamdinh } }, { _id: 1, tenhienthi: 1, time_block: 1, status: 1 }).sort({ thutu: 1 });

            items = items.filter(e => {
                let date_start_chamdiem = (new Date(cuocChamDiem.thoigianbatdautucham)).getTime();
                let date_block_user = e.status === true ? (new Date(e.time_block)).getTime() : (new Date()).getTime()
                let check = (e.status === false && date_start_chamdiem > date_block_user)
                return e.status === true || check
            });

            res.status(200).json(items)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },
    deletePhieuCham: async (req, res) => {
        let id = req.params.id;
        try {
            let check_nam_cham_diem_used = await QuantriNamChamdiem.find({
                "setting.phieucham": id
            });


            if (check_nam_cham_diem_used.length > 0) {
                return res.status(400).json({ message: "Không thể xóa mẫu phiếu chấm điểm do đang cấu hình mẫu phiếu trong cuộc chấm điểm" })
            };

            await PhieudiemNew.findByIdAndDelete(id);
            res.status(200).json({ message: "Xóa mẫu phiếu chấm điểm thành công!" })
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },
    test: async (req, res) => {
        let { year, id_user, id_phieucham } = req.query;

        const schema = Joi.object({
            year: Joi.number().required(),
            id_user: Joi.string().required(),
            id_phieucham: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            year: year,
            id_user: id_user,
            id_phieucham
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị year' });
        };
        try {
            let check_nam_cham_diem_used = await QuantriNamChamdiem.findOne({ user_created: value.id_user, nam: value.year })
            if (check_nam_cham_diem_used === null) {
                return res.status(401).json({ message: "Chưa có cuộc chấm điểm năm " + year })
            };
            // console.log(id_phieucham)
            // let x = check_nam_cham_diem_used.setting.find(e => e.phieucham === value.id_phieucham);
            // console.log(x)
            // let id_phieucham = x.phieucham;
            // let phieucham = await PhieudiemNew.findById(id_phieucham);
            let items = await Phieuchamdiems.find({ year: value.year, phieuchamdiem: id_phieucham }).populate('taikhoan', { _id: 1, tenhienthi: 1 })

            let data = [];
            for (let phieuchamdiem_of_user of items) {
                let list = phieuchamdiem_of_user.phieuchamdiem_detail;
                let total_diemthamdinhlan2 = 0;
                for (let i of list) {
                    let total_diemthamdinhlinhvuclan2 = 0;
                    //lọc qua từng tiêu chí của  lĩnh vực đẻ tính điểm cho lĩnh vực
                    let tieuchiList = [];
                    for (let tieuchi of i.tieuchi_group) {
                        let total_diemthamdinhtieuchilan2 = 0;

                        //lọc qua từng tiêu chí thành phần để tính điểm của tiêu chí
                        for (let tieuchithanhphan of tieuchi.tieuchithanhphan_group) {
                            total_diemthamdinhlinhvuclan2 += tieuchithanhphan.diemthamdinhlan2;
                        };

                        tieuchiList.push({
                            tieuchithanhphan_group: tieuchi.tieuchithanhphan_group,
                            tieuchi: {
                                diemthamdinhlan2: total_diemthamdinhtieuchilan2,
                            },
                            _id: tieuchi._id
                        });
                    };

                    total_diemthamdinhlan2 += total_diemthamdinhlinhvuclan2;
                };

                total_diemthamdinhlan2 += phieuchamdiem_of_user.diemthuongthamdinhlan2 - phieuchamdiem_of_user.diemphatthamdinhlan2;
                data.push({ ...phieuchamdiem_of_user._doc, diemthamdinh: total_diemthamdinhlan2, diemthuong: phieuchamdiem_of_user.diemthuongthamdinhlan2, diemphat: phieuchamdiem_of_user.diemphatthamdinhlan2 })
            };
            data = data.sort((a, b) => b.diemthamdinh - a.diemthamdinh);
            res.send(data)
        } catch (error) {
            console.log(error.message)
        }
    },


    // tiếp tục sửa phiên bản 2026

    //lấy ra danh sách tài khoản con đang active
    getListDonviConfigChamdiem: async (req, res) => {
        let { id_user } = req.query;

        const schema = Joi.object({
            id_user: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            id_user: id_user
        });
        if (error) {
            return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào' });
        };

        try {
            let items = await Users.find({ capcha: id_user, _id: { $ne: id_user }, status: true, role: false }, { tenhienthi: 1 }).lean();
            res.status(200).json(items)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    checkedEditCuocchamdiem: async (req, res) => {
        let { id_cuocchamdiem } = req.query;

        const schema = Joi.object({
            id_cuocchamdiem: Joi.string().required(),
        });

        const { error, value } = schema.validate({
            id_cuocchamdiem: id_cuocchamdiem
        });

        try {
            let check = await Phieuchamdiems.findOne({ id_cuocchamdiem }).lean();

            if (!check) {
                return res.status(200).json({ status: false })
            } else {
                return res.status(200).json({ status: true })
            }
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
        }
    },

    // lấy ra danh sách mẫu phiếu chấm điểm được sử dụng trong cuộc chấm điểm 
    // để là option xuất dữ liệu tổng hợp
    fetchMauphieuUsedNamchamdiem: async (req, res) => {
        try {
            let { year, id_user } = req.query;

            const schema = Joi.object({
                year: Joi.number().required(),
                id_user: Joi.string().required(),
            });

            const { error, value } = schema.validate({
                year: year,
                id_user
            });

            if (error) {
                return res.status(400).json({ status: false, message: 'Lỗi giá trị đầu vào ' + error.message });
            };
            let cuocChamDiem = await QuantriNamChamdiem.findOne({ user_created: value.id_user, nam: value.year }).populate('setting.phieucham', { name: 1 }).lean();
            if (cuocChamDiem === null) {
                return res.status(401).json({ status: "failed", message: "Chưa có cuộc chấm điểm năm " + year });
            };

            let setting = cuocChamDiem.setting;
            let phieuchams = setting.map(i => {
                return {
                    _id: i.phieucham._id,
                    name: i.phieucham.name
                }
            });

            res.status(200).json(phieuchams)

        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({ status: "failed", message: "Có lỗi xảy ra " + error.message });
        }
    },


    uploadAndConvertDocxToPdf: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'Không tìm thấy file Word được tải lên.' });
            }
            // BIẾN ĐỔI CHUẨN: Sửa lỗi font tiếng Việt cho originalname
            const originalNameUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
            const docxBuffer = req.file.buffer;
            const extend = '.pdf';

            // Tiến hành convert ngầm từ dữ liệu Buffer sang file PDF mạng nhị phân
            const pdfBuffer = await libre.convertAsync(docxBuffer, extend, undefined);
            // Tạo tên file mới đuôi .pdf từ tên file tiếng Việt đã sửa lỗi
            const safePdfName = originalNameUtf8.replace(/\.docx$/i, '.pdf');
            // Trả file PDF về trực tiếp cho Frontend dưới dạng Stream/Binary
            res.setHeader('Content-Type', 'application/pdf');
            // res.setHeader('Content-Disposition', 'attachment; filename=converted.pdf');
            // encodeURIComponent giúp trình duyệt nhận diện được file download có tên tiếng Việt có dấu
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safePdfName)}`);
            res.send(pdfBuffer);

        } catch (error) {
            console.error('Lỗi chuyển đổi file:', error);
            res.status(500).json({ error: 'Liên hệ Admin kiểm tra cấu hình LibreOffice trên Server.' });
        }
    },

    uploadResultAfterSignature: async (req, res) => {
        try {
            const { fileName, fileBase64 } = req.body;

            if (!fileBase64) {
                return res.status(400).json({ success: false, message: 'Dữ liệu file trống.' });
            }

            if (!fileName) {
                return res.status(400).json({ success: false, message: 'Thiếu tên file.' });
            }

            // 1. Sửa lỗi mã hóa tiếng Việt an toàn
            let rawFileName = String(fileName);
            try {
                rawFileName = Buffer.from(rawFileName, 'latin1').toString('utf8');
            } catch (e) {
                // Giữ nguyên tên file nếu parse lỗi
            }

            // 2. Làm sạch tên file & loại bỏ mọi ký tự điều hướng (Path Traversal)
            const safeBaseName = path.basename(rawFileName).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
            const uniqueFileName = `${Date.now()}_${safeBaseName}`;

            // 3. Chuẩn hóa thư mục người dùng an toàn
            const safeUserId = path.basename(String(req.userId.userId));
            const uploadBaseDir = path.resolve(__dirname, '../upload');
            const userDir = path.resolve(uploadBaseDir, safeUserId);

            if (!fs.existsSync(userDir)) {
                fs.mkdirSync(userDir, { recursive: true });
            }

            // 4. Tạo đường dẫn file tuyệt đối và kiểm tra rào chắn
            const finalPath = path.resolve(userDir, uniqueFileName);

            if (!finalPath.startsWith(userDir)) {
                console.warn(`Phát hiện hành vi Path Traversal từ user ${safeUserId}: ${finalPath}`);
                return res.status(403).json({ success: false, message: 'Đường dẫn file không hợp lệ.' });
            }

            // 5. Chuyển đổi Base64 và ghi file vật lý
            const fileBuffer = Buffer.from(fileBase64, 'base64');
            fs.writeFileSync(finalPath, fileBuffer);

            return res.status(200).json({
                success: true,
                message: 'Đã lưu file ký số lên hệ thống thành công!',
                fileName: uniqueFileName,
                fileUrl: uniqueFileName
            });

        } catch (error) {
            console.error('Lỗi xử lý ghi file ký số ở backend:', error);
            return res.status(500).json({ success: false, message: 'Lỗi ghi file hệ thống.' });
        }
    },


    saveFileSignature: async (req, res) => {
        let checkCase = req.body.case;
        let fileName = req.body.fileName;
        let id_phieucham = req.params.id;
        // console.log(id)
        let selectedField = checkCase === "MPSSIGN Tự chấm" ? "chotdiemtucham" : "chotdiemgiaitrinh"
        try {
            let phieucham = await Phieuchamdiems.findById(id_phieucham);
            phieucham[selectedField].files.push(fileName);
            await phieucham.save();
            res.status(200).json({ message: "Lưu file ký số thành công vào phiếu điểm" })
        } catch (error) {
            console.error('Lỗi xử lý ghi file ký số vào phiếu chấm điểm ở backend:', error);
            return res.status(500).json({ success: false, message: 'Lỗi xử lý ghi file ký số vào phiếu chấm điểm ở backend:' });
        }
    }
};
