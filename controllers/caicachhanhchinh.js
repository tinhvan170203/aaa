const Phieuchamdiems = require('../models/Phieuchamdiem');
const Joi = require('joi');
const path = require('path');
const docx = require('docx');
const {
  Document,
  Packer,
  Paragraph,
  convertInchesToTwip,
  WidthType,
  TextRun,
  AlignmentType,
  PageSize,
  PageOrientation,
  Table,
  TableCell,
  TableRow,
  VerticalAlign,
  TextDirection,
  HeadingLevel,
} = docx;
const fs = require('fs');
const Users = require('../models/Users');
const HistoriesSystem = require('../models/HistoriesSystem');
const QuantriNamChamdiem = require('../models/QuanlyNamChamdiem');
const PhieudiemNew = require('../models/PhieudiemNew');
const sanitize = require('sanitize-filename');
/*Hàm tính khoảng cách giữa 2 ngày trong javascript*/
const get_day_of_time = (d1, d2) => {
  let date1 = new Date(d1);
  let date2 = new Date(d2);
  let ms1 = date1.getTime();
  let ms2 = date2.getTime();
  return Math.ceil((ms2 - ms1) / (24 * 60 * 60 * 1000));
};

const convert_range_time_format = (date) => {
  // Định nghĩa hai thời điểm
  let startDate = new Date(); // Thời gian hiện tại

  let endDate = new Date(date); // Ngày kết thúc

  // Tính khoảng cách tính bằng mili giây
  let timeDiff = endDate - startDate;
  // timeDiff = Math.abs(timeDiff)
  // console.log(timeDiff)
  // Chuyển đổi mili giây thành các đơn vị thời gian
  // đổi sang giá trị tuyệt đối để tính số ngày, giò còn lại
  let timeDiff_abs = Math.abs(timeDiff);
  let seconds = Math.floor(timeDiff_abs / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  let days = Math.floor(hours / 24);
  // console.log(hours)
  // Tính số giờ, phút, giây còn lại , chia lấy phần dư
  let remainingHours = hours % 24;
  let remainingMinutes = minutes % 60;
  let remainingSeconds = seconds % 60;

  return {
    timeDiff,
    days,
    remainingHours,
    remainingMinutes,
    remainingSeconds,
  };
};

function getDeadlineStatus(timeDiff) {
  const DAY = 24 * 60 * 60 * 1000;

  if (timeDiff < 0) {
    return 'Quá hạn';
  }

  if (timeDiff <= DAY) {
    return 'Đến hạn';
  }

  if (timeDiff <= 7 * DAY) {
    return 'Sắp đến hạn';
  }

  return 'Dài hạn';
}

const resolveSafeUploadPath = (userId, fileName) => {
  const safeUserId = path.basename(String(userId));
  const safeFileName = sanitize(path.basename(String(fileName)));

  if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
    return null;
  }

  const uploadBaseDir = path.resolve(__dirname, '../upload');
  const userDir = path.resolve(uploadBaseDir, safeUserId);
  const filePath = path.resolve(userDir, safeFileName);

  if (!filePath.startsWith(userDir)) {
    return null;
  }

  return filePath;
};

const deleteSafeUploadFile = (userId, fileName) => {
  const filePath = resolveSafeUploadPath(userId, fileName);
  if (!filePath) {
    return false;
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }

  return false;
};

const saveAction = async (user_id, action) => {
  let newAction = new HistoriesSystem({
    user: user_id,
    action: action,
  });
  await newAction.save();
};

module.exports = {
  //tạo mới bảng điểm tự chấm
  // cần phân biệt tài khoản cấp xã và cấp phòng
  handleChangeSelectNam: async (req, res) => {
    let { year } = req.query;
    // year = Number(year)
    try {
      let user = await Users.findById(req.params.id).lean();
      // console.log(user)
      let id_capcha = user.capcha;
      const schema = Joi.object({
        year: Joi.number().required(),
        id: Joi.string().required(),
      });

      const { error, value } = schema.validate({
        year: year,
        id: req.params.id,
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị year' });
      }
      // console.log(id_capcha)
      //kiểm tra xem cuộc chấm điểm trong năm đó được tạo bới tài khoản cấp trên hay không
      let checked_namchamdiem = await QuantriNamChamdiem.findOne({
        nam: value.year,
        user_created: id_capcha,
      }).lean();
      // console.log(checked_namchamdiem)
      if (!checked_namchamdiem) {
        return res.status(401).json({
          message:
            'Thông báo: Cơ quan cấp trên chưa tạo bảng chấm điểm năm ' +
            year +
            '. Vui lòng liên hệ với cơ quan cấp trên',
        });
      } else {
        let item = await Phieuchamdiems.findOne({ year: value.year, taikhoan: value.id })
          .populate('phieuchamdiem')
          .lean();
        //TH chưa có phiếu chấm điểm thì tạo 1 bản chấm điểm mới của tài khoản
        if (!item) {
          let setting = checked_namchamdiem.setting;

          let index = setting.findIndex((i) =>
            i.accounts.map((e) => e.toString()).includes(user._id.toString()),
          );

          if (index === -1) {
            return res.status(401).json({
              message:
                'Thông báo: Đơn vị của bạn chưa được cấu hình chấm điểm cải cách hành chính năm ' +
                year +
                '. Vui lòng liên hệ với cơ quan cấp trên',
            });
          }

          let id_phieucham = setting[index].phieucham;

          let phieucham = await PhieudiemNew.findById(id_phieucham);

          let phieuchamdiem_detail = [...phieucham.phieuchamdiem];
          let data = [];

          let dulieu = {
            year: year,
            id_cuocchamdiem: checked_namchamdiem._id,
            chotdiemtucham: {
              status: false,
              files: [],
              time: null,
            },
            chotdiemgiaitrinh: {
              status: false,
              files: [],
              time: null,
            },
            diemthuongtoida: checked_namchamdiem.diemthuongtoida,
            diemphattoida: checked_namchamdiem.diemphattoida,
            taikhoan: req.params.id,
            phieuchamdiem: id_phieucham,
            phieuchamdiem_detail: phieuchamdiem_detail,
            diemthuong: 0,
            diemthuongthamdinhlan2: 0,
            diemphat: 0,
            diemphatthamdinhlan2: 0,
            diemthuongtucham: 0,
            diemphattucham: 0,
            ghichudiemthuong: {
              ghichucuadonvi: '',
              ghichucuathamdinh: '',
              files: [],
            },
            ghichudiemthuonggiaitrinh: {
              ghichucuadonvi: '',
              ghichucuathamdinh: '',
              files: [],
            },
            ghichudiemphat: {
              ghichucuadonvi: '',
              ghichucuathamdinh: '',
              files: [],
            },
            ghichudiemphatgiaitrinh: {
              ghichucuadonvi: '',
              ghichucuathamdinh: '',
              files: [],
            },
            yeucaugiaitrinhdiemthuong: false,
            yeucaugiaitrinhdiemphat: false,
            tongdiemtucham: 0,
            tongdiemthamdinhlan1: 0,
            tongdiemthamdinhlan2: 0,
            successtucham: false,
            successgiahan: false,
          };

          let newItem = new Phieuchamdiems(dulieu);
          let list = newItem.phieuchamdiem_detail;

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
              }

              tieuchiList.push({
                tieuchithanhphan_group: tieuchi.tieuchithanhphan_group,
                tieuchi: {
                  text: tieuchi.tieuchi.text,
                  diemtoida: tieuchi.tieuchi.diemtoida,
                  thutu: tieuchi.tieuchi.thutu,
                  diemtucham: total_diemtuchamtieuchi || 0,
                  diemthamdinhlan1: total_diemthamdinhtieuchi || 0,
                  diemthamdinhlan2: total_diemthamdinhtieuchilan2 || 0,
                },
                _id: tieuchi._id,
              });
            }

            data.push({
              linhvuc: {
                text: i.linhvuc.text,
                diemtoida: i.linhvuc.diemtoida,
                thutu: i.linhvuc.thutu,
                diemtucham: total_diemtuchamlinhvuc || 0,
                diemthamdinhlan1: total_diemthamdinhlinhvuc || 0,
                diemthamdinhlan2: total_diemthamdinhlinhvuclan2 || 0,
              },
              _id: i._id,
              tieuchi_group: tieuchiList,
            });
          }

          await newItem.save();
          //  console.log(item)
          let item = await Phieuchamdiems.findById(newItem._id).populate('phieuchamdiem');
          await saveAction(req.userId.userId, `Tạo mới bảng điểm tự chấm năm ${year}`);
          let phieuchamNew = {
            ...item._doc,
            phieuchamdiem_detail: data,
          };

          //check hạn tự chấm điểm
          let check_han_cham_diem = checked_namchamdiem.thoigianhethantuchamdiem;
          let check_han_giai_trinh = checked_namchamdiem.thoigianhethangiaitrinh;
          let { timeDiff, days, remainingHours, remainingMinutes } =
            convert_range_time_format(check_han_cham_diem); // tính ra khoảng cách thời gian còn hạn tự chấm hay không
          let { timeDiff_giaitrinh } = convert_range_time_format(check_han_giai_trinh);

          let time_den_han = '';
          let checkDateChamdiem = false; // biến xem thời hạn tự chấm điểm còn không
          if (timeDiff < 0) {
            checkDateChamdiem = true; // đã qua hạn tự chấm điểm
            time_den_han = 'Đã qua hạn tự chấm điểm';
          } else {
            if (days > 0) {
              time_den_han = `${days} ngày ${remainingHours} giờ ${remainingMinutes} phút`;
            } else {
              time_den_han = `${remainingHours} giờ ${remainingMinutes} phút`;
            }
          }

          res.status(200).json({
            phieuchamdiem: phieuchamNew,
            checkDateChamdiem,
            checked_namchamdiem,
            time_den_han,
            timeDiffText: getDeadlineStatus(timeDiff),
            timeDiffTextGiaitrinh: getDeadlineStatus(timeDiff_giaitrinh),
          });
        } else {
          let data = [];
          let list = item.phieuchamdiem_detail;

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
              }

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
                _id: tieuchi._id,
              });
            }

            data.push({
              linhvuc: {
                text: i.linhvuc.text,
                diemtoida: i.linhvuc.diemtoida,
                thutu: i.linhvuc.thutu,
                diemtucham: total_diemtuchamlinhvuc,
                diemthamdinhlan1: total_diemthamdinhlinhvuc,
                diemthamdinhlan2: total_diemthamdinhlinhvuclan2,
              },
              _id: i._id,
              tieuchi_group: tieuchiList,
            });
          }

          let phieuchamNew = {
            ...item,
            phieuchamdiem: {
              name: item.phieuchamdiem.name,
            },
            phieuchamdiem_detail: data,
          };

          let check_han_cham_diem = checked_namchamdiem.thoigianhethantuchamdiem;
          let check_han_giai_trinh = checked_namchamdiem.thoigianhethangiaitrinh;
          let { timeDiff, days, remainingHours, remainingMinutes } =
            convert_range_time_format(check_han_cham_diem); // tính ra khoảng cách thời gian còn hạn tự chấm hay không
          let { timeDiff_giaitrinh } = convert_range_time_format(check_han_giai_trinh); // tính ra khoảng cách thời gian còn hạn tự chấm hay không

          let time_den_han = '';
          let checkDateChamdiem = false; // biến xem thời hạn tự chấm điểm còn không
          if (timeDiff < 0) {
            checkDateChamdiem = true; // đã qua hạn tự chấm điểm
            time_den_han = 'Đã qua hạn tự chấm điểm';
          } else {
            if (days > 0) {
              time_den_han = `${days} ngày ${remainingHours} giờ ${remainingMinutes} phút`;
            } else {
              time_den_han = `${remainingHours} giờ ${remainingMinutes} phút`;
            }
          }

          res.status(200).json({
            phieuchamdiem: phieuchamNew,
            checkDateChamdiem,
            checked_namchamdiem,
            time_den_han,
            timeDiffText: getDeadlineStatus(timeDiff),
            timeDiffTextGiaitrinh: getDeadlineStatus(timeDiff_giaitrinh),
          });
        }
      }
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  saveUploadtailieu: async (req, res) => {
    let { id_linhvuc, id_tieuchi, filesSaved, filesDelete, id_tieuchithanhphan, ghichucuadonvi } =
      req.body;
    // console.log(id_linhvuc)
    try {
      //xóa bỏ các file cần xóa, gộp các file giữ lại + thêm mới
      let { id_phieucham } = req.params;
      //files đính kèm của từng tiêu chí
      let files = req.files.map((i) => {
        let path = i.path;
        let index = path.lastIndexOf('\\');
        return path.slice(index + 1);
      });

      filesDelete = JSON.parse(filesDelete);
      let text = '';
      let text1 = '';

      if (files.length > 0) {
        text = 'Thêm mới các file ' + files.toString();
      }

      if (filesDelete.length > 0) {
        text1 = ' Xóa các file tài liệu ' + filesDelete.toString();
      }
      text = text + text1;

      // for (i of filesDelete) {
      //   let path_delete = path.join(__dirname, `../upload/${req.userId.userId}/` + i);
      //   if (fs.existsSync(path_delete)) {
      //     fs.unlinkSync(path.join(__dirname, `../upload/${req.userId.userId}/` + i));
      //     console.log(`The file ${path_delete} exists.`);
      //   } else {
      //     console.log(`The file ${path_delete} does not exist.`);
      //   }
      // }
      for (const filename of filesDelete) {
        // Làm sạch tên file
        const safeFileName = sanitize(path.basename(filename));

        // Kiểm tra tính hợp lệ của tên file
        if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
          console.log(`Invalid filename: ${filename}`);
          continue; // bỏ qua file không hợp lệ
        }

        const filePath = path.join(__dirname, `../upload/${req.userId.userId}/`, safeFileName);

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`The file ${filePath} exists and was deleted.`);
          } catch (err) {
            console.error(`Error deleting file ${filePath}:`, err);
          }
        } else {
          console.log(`The file ${filePath} does not exist.`);
        }
      }

      files = JSON.parse(filesSaved).concat(files);
      let phieucham = await Phieuchamdiems.findById(id_phieucham);

      let phieuchamdiem_detail = [...phieucham.phieuchamdiem_detail];
      phieuchamdiem_detail = phieuchamdiem_detail.map((detail) => {
        if (detail._id.toString() === id_linhvuc) {
          return {
            ...detail,
            tieuchi_group: detail.tieuchi_group.map((tieuchi) => {
              if (tieuchi._id.toString() === id_tieuchi) {
                return {
                  ...tieuchi,
                  tieuchithanhphan_group: tieuchi.tieuchithanhphan_group.map((tieuchithanhphan) => {
                    if (tieuchithanhphan._id.toString() === id_tieuchithanhphan) {
                      return {
                        ...tieuchithanhphan,
                        ghichucuadonvilan1: ghichucuadonvi,
                        files: files,
                      };
                    } else {
                      return { ...tieuchithanhphan };
                    }
                  }),
                };
              } else {
                return { ...tieuchi };
              }
            }),
          };
        } else {
          return detail;
        }
      });
      await Phieuchamdiems.findByIdAndUpdate(id_phieucham, {
        phieuchamdiem_detail,
      });

      await saveAction(
        req.userId.userId,
        `Lưu tài liệu kiểm chứng "${text}" và ghi chú của đơn vị: "${ghichucuadonvi}"`,
      );
      res.status(200).json({
        message: 'Lưu tài liệu kiểm chứng thành công',
        files: files,
        ghichucuadonvi,
        id_linhvuc,
        id_tieuchi,
        id_tieuchithanhphan,
      });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  downloadFile: async (req, res) => {
    try {
      const { file } = req.params;
      const { id_user } = req.query;

      if (!file || !id_user) {
        return res.status(400).send('Thiếu thông tin file hoặc người dùng');
      }

      // 1. Loại bỏ các ký tự điều hướng (../, ..\) khỏi tham số đầu vào
      const safeUserId = path.basename(String(id_user));
      const safeFileName = path.basename(String(file));

      // 2. Xác định thư mục upload gốc chuẩn dạng tuyệt đối
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      // 3. Tạo đường dẫn file tuyệt đối
      const path_file = path.resolve(userDir, safeFileName);

      // 4. Rào chắn an toàn: Kiểm tra đường dẫn file có thuộc thư mục userDir hay không
      if (!path_file.startsWith(userDir)) {
        console.warn(`Phát hiện hành vi Path Traversal từ user ${safeUserId}: ${path_file}`);
        return res.status(403).send('Truy cập bị từ chối');
      }

      // 5. Kiểm tra file tồn tại
      if (!fs.existsSync(path_file)) {
        return res.status(404).send('File không tồn tại');
      }

      // 6. Thực hiện tải file xuống
      res.download(path_file, safeFileName, function (err) {
        if (err) {
          console.error('Lỗi khi tải file xuống:', err);
          if (!res.headersSent) {
            return res.status(500).send('Lỗi tải file');
          }
        } else {
          console.log('Tải file xuống thành công');
        }
      });
    } catch (error) {
      console.error('Lỗi downloadFile:', error);
      if (!res.headersSent) {
        return res.status(500).send('Lỗi hệ thống');
      }
    }
  },

  
  saveUploadtailieuGiaitrinh: async (req, res) => {
    let { id_linhvuc, id_tieuchi, filesSaved, filesDelete, id_tieuchithanhphan, ghichucuadonvi } =
      req.body;

    try {
      let { id_phieucham } = req.params;

      // 1. Chuẩn hóa tên các file mới upload (dùng path.basename để chạy đúng trên cả Windows & Linux)
      let files = (req.files || []).map((i) => path.basename(i.path));

      // 2. Safely parse JSON inputs
      let parsedFilesDelete = [];
      let parsedFilesSaved = [];

      try {
        parsedFilesDelete = filesDelete ? JSON.parse(filesDelete) : [];
        parsedFilesSaved = filesSaved ? JSON.parse(filesSaved) : [];
      } catch (parseErr) {
        return res
          .status(400)
          .json({ status: 'failed', message: 'Dữ liệu JSON truyền vào không hợp lệ' });
      }

      let text = '';
      let text1 = '';

      if (files.length > 0) {
        text = 'Thêm mới các file ' + files.toString();
      }

      if (parsedFilesDelete.length > 0) {
        text1 = ' Xóa các file tài liệu ' + parsedFilesDelete.toString();
      }
      text = text + text1;

      // 3. Bảo mật thư mục Upload & Xóa file an toàn (Chống Path Manipulation)
      const safeUserId = path.basename(String(req.userId.userId));
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      for (const filename of parsedFilesDelete) {
        const safeFileName = path.basename(filename);

        // Validate định dạng tên file
        if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
          console.log(`Invalid filename: ${filename}`);
          continue;
        }

        // Xác định đường dẫn tuyệt đối
        const filePath = path.resolve(userDir, safeFileName);

        // Kiểm tra xem filePath có thực sự thuộc về userDir không (Chặn tuyệt đối Path Traversal)
        if (!filePath.startsWith(userDir)) {
          console.warn(`Cảnh báo Path Traversal phát hiện từ user ${safeUserId}: ${filePath}`);
          continue;
        }

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`File ${filePath} đã được xóa thành công.`);
          } catch (err) {
            console.error(`Lỗi khi xóa file ${filePath}:`, err);
          }
        } else {
          console.log(`File ${filePath} không tồn tại.`);
        }
      }

      // Gộp file đã giữ lại + file mới upload
      files = parsedFilesSaved.concat(files);

      // 4. Cập nhật cơ sở dữ liệu
      let phieucham = await Phieuchamdiems.findById(id_phieucham);
      if (!phieucham) {
        return res
          .status(404)
          .json({ status: 'failed', message: 'Không tìm thấy phiếu chấm điểm' });
      }

      let phieuchamdiem_detail = phieucham.phieuchamdiem_detail.map((detail) => {
        if (detail._id.toString() === id_linhvuc) {
          return {
            ...detail,
            tieuchi_group: detail.tieuchi_group.map((tieuchi) => {
              if (tieuchi._id.toString() === id_tieuchi) {
                return {
                  ...tieuchi,
                  tieuchithanhphan_group: tieuchi.tieuchithanhphan_group.map((tieuchithanhphan) => {
                    if (tieuchithanhphan._id.toString() === id_tieuchithanhphan) {
                      return {
                        ...tieuchithanhphan,
                        ghichucuadonvilan2: ghichucuadonvi,
                        files_bosung: files,
                      };
                    }
                    return tieuchithanhphan;
                  }),
                };
              }
              return tieuchi;
            }),
          };
        }
        return detail;
      });

      await Phieuchamdiems.findByIdAndUpdate(id_phieucham, {
        phieuchamdiem_detail,
      });

      await saveAction(
        req.userId.userId,
        `Lưu tài liệu giải trình "${text}" và ghi chú của đơn vị: "${ghichucuadonvi}"`,
      );

      res.status(200).json({
        message: 'Lưu tài liệu giải trình thành công',
        files: files,
        ghichucuadonvi,
        id_linhvuc,
        id_tieuchi,
        id_tieuchithanhphan,
      });
    } catch (error) {
      console.error('Lỗi saveUploadtailieuGiaitrinh:', error);
      res.status(500).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  updateChamdiem: async (req, res) => {
    let { list, id_phieucham, diemthuongtucham, diemphattucham } = req.body;
    //check xem da khoa tu cham diem hay chua

    try {
      // console.log('dsada',data[0].tieuchi_group[0].tieuchithanhphan[0].diemtucham)
      let item = await Phieuchamdiems.findByIdAndUpdate(id_phieucham, {
        phieuchamdiem_detail: list,
        diemthuongtucham,
        diemphattucham,
      });

      await saveAction(req.userId.userId, `Cập nhật bảng điểm tự chấm năm ${item.year}`);
      res.status(200).json({ message: 'Cập nhật điểm tự chấm thành công' });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  checkedChotdiem: async (req, res) => {
    let { year, id_user } = req.query;
    try {
      const schema = Joi.object({
        year: Joi.number().required(),
        id_user: Joi.string().required(),
      });

      const { error, value } = schema.validate({
        year: year,
        id_user: id_user,
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị year' });
      }
      let item = await Phieuchamdiems.findOne({ year: value.year, taikhoan: value.id_user });
      if (!item) {
        return res.status(401).json({
          message:
            'Chưa có bảng tự chấm điểm trong hệ thống, thao tác chốt điểm tự chấm không thể thực hiện',
        });
      }
      // console.log(item)
      res.status(200).json({ data: item.chotdiemtucham, idPhieucham: item._id });
    } catch (error) {}
  },

  saveChotdiemtucham: async (req, res) => {
    let { filesSaved, filesDelete } = req.body;

    try {
      let { id } = req.params;

      // 1. Chuẩn hóa tên file upload (Tương thích cả Windows & Linux)
      let files = (req.files || []).map((i) => path.basename(i.path));

      // 2. Safely parse JSON inputs
      let parsedFilesDelete = [];
      let parsedFilesSaved = [];

      try {
        parsedFilesDelete = filesDelete ? JSON.parse(filesDelete) : [];
        parsedFilesSaved = filesSaved ? JSON.parse(filesSaved) : [];
      } catch (parseErr) {
        return res.status(400).json({ status: 'failed', message: 'Dữ liệu JSON không hợp lệ' });
      }

      // 3. Khóa đường dẫn xóa file an toàn - Chống Path Manipulation
      const safeUserId = path.basename(String(req.userId.userId));
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      for (const filename of parsedFilesDelete) {
        const safeFileName = path.basename(filename);

        // Validate ký tự hợp lệ
        if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
          console.log(`Invalid filename: ${filename}`);
          continue;
        }

        // Đường dẫn tuyệt đối đến file
        const filePath = path.resolve(userDir, safeFileName);

        // Rào chắn bảo vệ: File xóa bắt buộc phải nằm trong thư mục userDir
        if (!filePath.startsWith(userDir)) {
          console.warn(`Phát hiện hành vi Path Traversal từ user ${safeUserId}: ${filePath}`);
          continue;
        }

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`File ${filePath} đã được xóa thành công.`);
          } catch (err) {
            console.error(`Lỗi khi xóa file ${filePath}:`, err);
          }
        } else {
          console.log(`File ${filePath} không tồn tại.`);
        }
      }

      // Gộp file đã giữ lại + file mới upload
      files = parsedFilesSaved.concat(files);

      // 4. Cập nhật Database
      let phieucham = await Phieuchamdiems.findByIdAndUpdate(id, {
        chotdiemtucham: {
          status: true,
          files,
          time: new Date(),
        },
      });

      if (!phieucham) {
        return res
          .status(404)
          .json({ status: 'failed', message: 'Không tìm thấy phiếu chấm điểm' });
      }

      await saveAction(req.userId.userId, `Chốt điểm tự chấm`);

      res.status(200).json({
        message: 'Chốt điểm tự chấm thành công',
        files: files,
      });
    } catch (error) {
      console.error('Lỗi saveChotdiemtucham:', error);
      res.status(500).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  saveChotdiemGiaitrinh: async (req, res) => {
    let { filesSaved, filesDelete } = req.body;

    try {
      let { id } = req.params;

      // 1. Chuẩn hóa tên file upload (Chạy tốt cả trên Windows & Linux)
      let files = (req.files || []).map((i) => path.basename(i.path));

      // 2. Safe parse JSON inputs
      let parsedFilesDelete = [];
      let parsedFilesSaved = [];

      try {
        parsedFilesDelete = filesDelete ? JSON.parse(filesDelete) : [];
        parsedFilesSaved = filesSaved ? JSON.parse(filesSaved) : [];
      } catch (parseErr) {
        return res.status(400).json({ status: 'failed', message: 'Dữ liệu JSON không hợp lệ' });
      }

      // 3. Khóa đường dẫn xóa file an toàn - Chống Path Manipulation
      const safeUserId = path.basename(String(req.userId.userId));
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      for (const filename of parsedFilesDelete) {
        const safeFileName = path.basename(filename);

        // Validate ký tự tên file
        if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
          console.log(`Invalid filename: ${filename}`);
          continue;
        }

        // Đường dẫn tuyệt đối đến file cần xóa
        const filePath = path.resolve(userDir, safeFileName);

        // Rào chắn bảo vệ: File xóa bắt buộc phải nằm trong thư mục userDir
        if (!filePath.startsWith(userDir)) {
          console.warn(`Phát hiện hành vi Path Traversal từ user ${safeUserId}: ${filePath}`);
          continue;
        }

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`File ${filePath} đã được xóa thành công.`);
          } catch (err) {
            console.error(`Lỗi khi xóa file ${filePath}:`, err);
          }
        } else {
          console.log(`File ${filePath} không tồn tại.`);
        }
      }

      // Gộp file đã giữ lại + file mới upload
      files = parsedFilesSaved.concat(files);

      // 4. Cập nhật Database
      let phieucham = await Phieuchamdiems.findByIdAndUpdate(id, {
        chotdiemgiaitrinh: {
          status: true,
          files,
          time: new Date(),
        },
      });

      if (!phieucham) {
        return res
          .status(404)
          .json({ status: 'failed', message: 'Không tìm thấy phiếu chấm điểm' });
      }

      await saveAction(req.userId.userId, `Chốt tài liệu phần giải trình`);

      res.status(200).json({
        message: 'Chốt giải trình thành công',
        files: files,
      });
    } catch (error) {
      console.error('Lỗi saveChotdiemGiaitrinh:', error);
      res.status(500).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  fetchTaikhoanDiaphuong: async (req, res) => {
    try {
      let items = await Users.find({ role: 'Quản trị tại đơn vị' });
      res.status(200).json(items);
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  fetchBangchamthamdinh: async (req, res) => {
    let { year, taikhoan } = req.query;
    // console.log(req.query)
    year = Number(year);
    const schema = Joi.object({
      year: Joi.number().required(),
      taikhoan: Joi.string().required(),
    });

    const { error, value } = schema.validate({
      year: year,
      taikhoan: taikhoan,
    });
    if (error) {
      return res.status(400).json({ status: false, message: 'Lỗi giá trị year' });
    }
    try {
      let item = await Phieuchamdiems.findOne({
        year: value.year,
        taikhoan: value.taikhoan,
      }).populate('phieuchamdiem');
      if (!item) {
        return res
          .status(400)
          .json({ message: 'Không có bảng điểm tự chấm của đơn vị trong hệ thống phần mềm.' });
      }

      let checked_namchamdiem = await QuantriNamChamdiem.findOne({
        nam: value.year,
        user_created: item.phieuchamdiem.user_created,
      });

      if (!checked_namchamdiem) {
        return res.status(401).json({
          message:
            'Thông báo: Cơ quan cấp trên chưa tạo bảng chấm điểm năm ' +
            year +
            '. Vui lòng liên hệ với cơ quan cấp trên',
        });
      }

      let data = [];
      let list = item.phieuchamdiem_detail;

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
          }

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
            _id: tieuchi._id,
          });
        }

        data.push({
          linhvuc: {
            text: i.linhvuc.text,
            diemtoida: i.linhvuc.diemtoida,
            thutu: i.linhvuc.thutu,
            diemtucham: total_diemtuchamlinhvuc,
            diemthamdinhlan1: total_diemthamdinhlinhvuc,
            diemthamdinhlan2: total_diemthamdinhlinhvuclan2,
          },
          _id: i._id,
          tieuchi_group: tieuchiList,
        });
      }

      let phieuchamNew = {
        ...item._doc,
        phieuchamdiem_detail: data,
      };

      //check hạn tự chấm điểm
      let check_han_cham_diem = checked_namchamdiem.thoigianhethantuchamdiem;
      let check_han_giai_trinh = checked_namchamdiem.thoigianhethangiaitrinh;
      let { timeDiff, days, remainingHours, remainingMinutes } =
        convert_range_time_format(check_han_cham_diem); // tính ra khoảng cách thời gian còn hạn tự chấm hay không
      let { timeDiff_giaitrinh } = convert_range_time_format(check_han_giai_trinh);

      let time_den_han = '';
      let checkDateChamdiem = false; // biến xem thời hạn tự chấm điểm còn không
      if (timeDiff < 0) {
        checkDateChamdiem = true; // đã qua hạn tự chấm điểm
        time_den_han = 'Đã qua hạn tự chấm điểm';
      } else {
        if (days > 0) {
          time_den_han = `${days} ngày ${remainingHours} giờ ${remainingMinutes} phút`;
        } else {
          time_den_han = `${remainingHours} giờ ${remainingMinutes} phút`;
        }
      }

      res.status(200).json({
        phieuchamdiem: phieuchamNew,
        checkDateChamdiem,
        checked_namchamdiem,
        time_den_han,
        timeDiffText: getDeadlineStatus(timeDiff),
        timeDiffTextGiaitrinh: getDeadlineStatus(timeDiff_giaitrinh),
      });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  updateGhichuthamdinh: async (req, res) => {
    let { id_linhvuc, id_tieuchi, id_tieuchithanhphan, ghichucuathamdinh } = req.body;
    // console.log(id_linhvuc)
    try {
      let { id } = req.params;
      // console.log(id)
      let phieucham = await Phieuchamdiems.findById(id).populate('taikhoan');
      // console.log(phieucham)
      let phieuchamdiem_detail = [...phieucham.phieuchamdiem_detail];
      phieuchamdiem_detail = phieuchamdiem_detail.map((detail) => {
        if (detail._id.toString() === id_linhvuc) {
          return {
            ...detail,
            tieuchi_group: detail.tieuchi_group.map((tieuchi) => {
              if (tieuchi._id.toString() === id_tieuchi) {
                return {
                  ...tieuchi,
                  tieuchithanhphan_group: tieuchi.tieuchithanhphan_group.map((tieuchithanhphan) => {
                    if (tieuchithanhphan._id.toString() === id_tieuchithanhphan) {
                      return {
                        ...tieuchithanhphan,
                        ghichucuathamdinh1: ghichucuathamdinh,
                      };
                    } else {
                      return { ...tieuchithanhphan };
                    }
                  }),
                };
              } else {
                return { ...tieuchi };
              }
            }),
          };
        } else {
          return detail;
        }
      });
      await Phieuchamdiems.findByIdAndUpdate(id, {
        phieuchamdiem_detail,
      });
      await saveAction(
        req.userId.userId,
        `Lưu ghi chú thẩm định lần 1: "${ghichucuathamdinh}" đối với bảng điểm của ${phieucham.taikhoan.tenhienthi} năm ${phieucham.year}`,
      );
      res.status(200).json({
        message: 'Lưu ghi chú thẩm định thành công',
        ghichucuathamdinh,
        id_linhvuc,
        id_tieuchi,
        id_tieuchithanhphan,
      });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  updateGhichuthamdinhlan2: async (req, res) => {
    let { id_linhvuc, id_tieuchi, id_tieuchithanhphan, ghichucuathamdinh } = req.body;
    // console.log(id_linhvuc)
    try {
      let { id } = req.params;
      // console.log()
      let phieucham = await Phieuchamdiems.findById(id).populate('taikhoan');

      let phieuchamdiem_detail = [...phieucham.phieuchamdiem_detail];
      phieuchamdiem_detail = phieuchamdiem_detail.map((detail) => {
        if (detail._id.toString() === id_linhvuc) {
          return {
            ...detail,
            tieuchi_group: detail.tieuchi_group.map((tieuchi) => {
              if (tieuchi._id.toString() === id_tieuchi) {
                return {
                  ...tieuchi,
                  tieuchithanhphan_group: tieuchi.tieuchithanhphan_group.map((tieuchithanhphan) => {
                    if (tieuchithanhphan._id.toString() === id_tieuchithanhphan) {
                      return {
                        ...tieuchithanhphan,
                        ghichucuathamdinh2: ghichucuathamdinh,
                      };
                    } else {
                      return { ...tieuchithanhphan };
                    }
                  }),
                };
              } else {
                return { ...tieuchi };
              }
            }),
          };
        } else {
          return detail;
        }
      });
      await Phieuchamdiems.findByIdAndUpdate(id, {
        phieuchamdiem_detail,
      });
      await saveAction(
        req.userId.userId,
        `Lưu ghi chú thẩm định sau khi giải trình: "${ghichucuathamdinh}" đối với bảng điểm của ${phieucham.taikhoan.tenhienthi} năm ${phieucham.year}`,
      );
      res.status(200).json({
        message: 'Lưu ghi chú thẩm định thành công',
        ghichucuathamdinh,
        id_linhvuc,
        id_tieuchi,
        id_tieuchithanhphan,
      });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  saveDiemthamdinh: async (req, res) => {
    let {
      list,
      id_phieucham,
      diemphat,
      diemthuong,
      diemthuongthamdinhlan2,
      diemphatthamdinhlan2,
      yeucaugiaitrinhdiemphat,
      yeucaugiaitrinhdiemthuong,
    } = req.body;
    try {
      let item = await Phieuchamdiems.findByIdAndUpdate(id_phieucham, {
        phieuchamdiem_detail: list,
        diemphat,
        diemthuong,
        diemthuongthamdinhlan2,
        diemphatthamdinhlan2,
        yeucaugiaitrinhdiemphat,
        yeucaugiaitrinhdiemthuong,
      }).populate('taikhoan');
      // console.log(req.userId)
      await saveAction(
        req.userId.userId,
        `Cập nhật điểm thẩm định của ${item.taikhoan.tenhienthi} năm ${item.year}`,
      );
      res.status(200).json({ message: 'Cập nhật điểm thẩm định thành công' });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  trackingBangdiem: async (req, res) => {
    let { year } = req.query;
    try {
      const schema = Joi.object({
        year: Joi.number().required(),
      });

      const { error, value } = schema.validate({
        year: year,
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị year' });
      }
      let items = await Phieuchamdiems.find({ year: value.year }).populate('taikhoan');
      // console.log(items)
      let taikhoans = await Users.find({
        role: 'Quản trị tại đơn vị',
        taikhoancap: { $ne: ['xã'] },
      });
      // console.log(taikhoans)
      let data = [];

      for (let i of taikhoans) {
        // console.log(i._id.toString())
        let checked = items.find((e) => e.taikhoan._id.toString() === i._id.toString());
        // console.log(checked)
        let checked_trangthaichotso = false;
        if (checked) {
          checked_trangthaichotso = checked.chotdiemtucham.status;
        }

        if (checked) {
          data.push({
            donvi: i.tenhienthi,
            dachamdiem: true,
            time: checked.chotdiemtucham.time || '',
            trangthaichotso: checked_trangthaichotso,
            idPhieucham: checked._id,
            trangthaixuly:
              checked.trinhlanhdao.trangthai[checked.trinhlanhdao.trangthai.length - 1].text,
            files: checked.chotdiemtucham.files,
          });
        } else {
          data.push({
            donvi: i.tenhienthi,
            dachamdiem: false,
            time: '',
            trangthaixuly: 'Chưa chấm điểm',
            trangthaichotso: false,
            files: [],
          });
        }
      }
      // data = items.filter(i=> i.taikhoan.role === "Quản trị tại đơn vị");
      res.status(200).json(data);
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  trackingBangdiemCapxa: async (req, res) => {
    let { year } = req.query;
    try {
      const schema = Joi.object({
        year: Joi.number().required(),
      });

      const { error, value } = schema.validate({
        year: year,
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị year' });
      }
      let items = await Phieuchamdiems.find({ year: value.year }).populate('taikhoan');
      // console.log(items)
      let taikhoans = await Users.find({ role: 'Quản trị tại đơn vị', taikhoancap: ['xã'] });
      // console.log(taikhoans)
      let data = [];

      for (let i of taikhoans) {
        // console.log(i._id.toString())
        let checked = items.find((e) => e.taikhoan._id.toString() === i._id.toString());
        // console.log(checked)
        let checked_trangthaichotso = false;
        if (checked) {
          checked_trangthaichotso = checked.chotdiemtucham.status;
        }

        if (checked) {
          data.push({
            donvi: i.tenhienthi,
            dachamdiem: true,
            time: checked.chotdiemtucham.time || '',
            trangthaichotso: checked_trangthaichotso,
            trangthaixuly:
              checked.trinhlanhdao.trangthai[checked.trinhlanhdao.trangthai.length - 1].text,
            idPhieucham: checked._id,
            files: checked.chotdiemtucham.files,
          });
        } else {
          data.push({
            donvi: i.tenhienthi,
            dachamdiem: false,
            time: '',
            trangthaixuly: 'Chưa chấm điểm',
            trangthaichotso: false,
            files: [],
          });
        }
      }
      // data = items.filter(i=> i.taikhoan.role === "Quản trị tại đơn vị");
      res.status(200).json(data);
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  changeStatusChotdiem: async (req, res) => {
    let { id } = req.query;
    try {
      let item = await Phieuchamdiems.findById(id).populate('taikhoan');
      item.chotdiemtucham.status = !item.chotdiemtucham.status;
      await item.save();
      await saveAction(
        req.userId.userId,
        `Thay đổi trạng thái chốt điểm của ${item.taikhoan.tenhienthi} năm ${item.year}`,
      );
      res.status(200).json({ message: 'Thay đổi trạng thái chốt sổ thành công' });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  getDataOfChart: async (req, res) => {
    // xeeps loai diem tham dinh cap phong, huyen
    let { year } = req.query;
    const schema = Joi.object({
      year: Joi.number().required(),
    });

    const { error, value } = schema.validate({
      year,
    });
    if (error) {
      return res.status(400).json({
        status: false,
        message: 'Lỗi giá trị nhập vào từ người dùng. Vui lòng kiểm tra lại',
      });
    }
    try {
      // let taikhoans = await Users.find({ role: "Quản trị tại đơn vị", taikhoancap: ['phòng'] });
      let taikhoans = await Users.find({
        role: 'Quản trị tại đơn vị',
        taikhoancap: { $ne: ['xã'] },
      });

      let data = [];
      for (let taikhoan of taikhoans) {
        let phieudiem = await Phieuchamdiems.findOne({ taikhoan: taikhoan._id, year: value.year })
          .populate('phieuchamdiem.linhvuc')
          .populate('phieuchamdiem.tieuchi_group.tieuchi')
          .populate('phieuchamdiem.tieuchi_group.tieuchithanhphan.tieuchithanhphan');

        if (!phieudiem) {
          data.push({
            donvi: taikhoan.tenhienthi,
            tongdiemtucham: 0,
            tongdiemthamdinh: 0,
          });
        } else {
          // console.log(phieudiem)
          let list = phieudiem.phieuchamdiem;
          let tongdiemtucham = 0;
          let tongdiemthamdinh = 0;
          // console.log(list[0].tieuchi_group[0].tieuchithanhphan)
          for (let i of list) {
            let tieuchi_group = i.tieuchi_group;
            let tieuchiList = [];
            let total_diemtuchamlinhvuc = 0;
            let total_diemthamdinhlinhvuc = 0;

            for (let tieuchi of tieuchi_group) {
              let total_diemtuchamtieuchi = 0;
              let total_diemthamdinhtieuchi = 0;
              tieuchi.tieuchithanhphan.forEach((el) => {
                total_diemtuchamtieuchi += el.diemtucham;
                total_diemthamdinhtieuchi += el.diemthamdinh;
              });
              total_diemthamdinhlinhvuc += total_diemthamdinhtieuchi;
              total_diemtuchamlinhvuc += total_diemtuchamtieuchi;
            }

            tongdiemtucham += total_diemtuchamlinhvuc;
            tongdiemthamdinh += total_diemthamdinhlinhvuc;
          }

          data.push({
            donvi: taikhoan.tenhienthi,
            tongdiemtucham: tongdiemtucham,
            tongdiemthamdinh: tongdiemthamdinh + phieudiem.diemthuong - phieudiem.diemphat,
          });
        }
      }
      data.sort((a, b) => b.tongdiemthamdinh - a.tongdiemthamdinh);

      let data_ranks = [];
      let i = 0;
      while (data.length !== 0) {
        let index_slice = data.filter(
          (e) => e.tongdiemthamdinh === data[0].tongdiemthamdinh,
        ).length;
        // console.log(index_slice)
        let data_slice = data.slice(0, index_slice);
        data_slice.forEach((el) => {
          data_ranks.push({
            ...el,
            rank: i + 1,
          });
        });
        data = data.slice(index_slice);
        i++;
      }

      res.status(200).json({ message: '', data: data_ranks });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  getDataXeploaiCapxa: async (req, res) => {
    let { year } = req.query;
    try {
      const schema = Joi.object({
        year: Joi.number().required(),
      });

      const { error, value } = schema.validate({
        year: year,
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị year' });
      }
      let taikhoans = await Users.find({ role: 'Quản trị tại đơn vị', taikhoancap: ['xã'] });

      let data = [];
      for (let taikhoan of taikhoans) {
        let phieudiem = await Phieuchamdiems.findOne({ taikhoan: taikhoan._id, year: value.year })
          .populate('phieuchamdiem.linhvuc')
          .populate('phieuchamdiem.tieuchi_group.tieuchi')
          .populate('phieuchamdiem.tieuchi_group.tieuchithanhphan.tieuchithanhphan');

        if (!phieudiem) {
          data.push({
            tentaikhoan: taikhoan.tentaikhoan,
            donvi: taikhoan.tenhienthi,
            tongdiemtucham: 0,
            tongdiemthamdinh: 0,
          });
        } else {
          // console.log(phieudiem)
          let list = phieudiem.phieuchamdiem;
          let tongdiemtucham = 0;
          let tongdiemthamdinh = 0;
          // console.log(list[0].tieuchi_group[0].tieuchithanhphan)
          for (let i of list) {
            let tieuchi_group = i.tieuchi_group;
            // let tieuchiList = [];
            let total_diemtuchamlinhvuc = 0;
            let total_diemthamdinhlinhvuc = 0;

            for (let tieuchi of tieuchi_group) {
              let total_diemtuchamtieuchi = 0;
              let total_diemthamdinhtieuchi = 0;

              tieuchi.tieuchithanhphan.forEach((el) => {
                total_diemtuchamtieuchi += el.diemtucham;
                total_diemthamdinhtieuchi += el.diemthamdinh;
              });

              total_diemthamdinhlinhvuc += total_diemthamdinhtieuchi;
              total_diemtuchamlinhvuc += total_diemtuchamtieuchi;
            }

            tongdiemtucham += total_diemtuchamlinhvuc;
            tongdiemthamdinh += total_diemthamdinhlinhvuc;
          }

          data.push({
            tentaikhoan: taikhoan.tentaikhoan,
            donvi: taikhoan.tenhienthi,
            tongdiemtucham: tongdiemtucham,
            tongdiemthamdinh: tongdiemthamdinh + phieudiem.diemthuong - phieudiem.diemphat,
          });
        }
      }
      data.sort((a, b) => b.tongdiemthamdinh - a.tongdiemthamdinh);

      let data_ranks = [];
      let i = 0;
      while (data.length !== 0) {
        let index_slice = data.filter(
          (e) => e.tongdiemthamdinh === data[0].tongdiemthamdinh,
        ).length;
        // console.log(index_slice)
        let data_slice = data.slice(0, index_slice);
        data_slice.forEach((el) => {
          data_ranks.push({
            ...el,
            rank: i + 1,
          });
        });
        data = data.slice(index_slice);
        i++;
      }

      // console.log(data)
      res.status(200).json({ message: '', data: data_ranks });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  getQuantrichamdiems: async (req, res) => {
    try {
      let list = await Quantrichamdiem.find({}).sort({ nam: -1 });
      res.status(200).json(list);
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: 'Có lỗi xảy ra. Vui lòng liên hệ quản trị viên' + 'Mã lỗi:' + error.message,
      });
    }
  },

  addQuantrichamdiem: async (req, res) => {
    try {
      let newItem = new Quantrichamdiem(req.body);
      await newItem.save();

      let list = await Quantrichamdiem.find({}).sort({ nam: -1 });
      res.status(200).json({ list, message: 'Lưu dữ liệu thành công!' });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message:
          'Có lỗi xảy ra. Vui lòng liên hệ quản trị viên hệ thống. \n Mã lỗi: ' + error.message,
      });
    }
  },

  updateQuantrichamdiem: async (req, res) => {
    let { nam, status, ngayhethanchamdiem, ngayhethanthamdinh } = req.body;
    // console.log(req.body)
    nam = Number(nam);
    let id = req.params.id;
    // console.log(status)
    try {
      await Quantrichamdiem.findByIdAndUpdate(id, {
        nam,
        trangthai: status,
        ngayhethanchamdiem,
        ngayhethanthamdinh,
      });

      let list = await Quantrichamdiem.find({}).sort({ nam: -1 });

      res.status(200).json({ list, message: 'Update dữ liệu thành công!' });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: 'Có lỗi xảy ra khi update. Vui lòng liên hệ quản trị viên',
      });
    }
  },

  deleteQuantrichamdiem: async (req, res) => {
    let id = req.params.id;
    try {
      await Quantrichamdiem.findByIdAndDelete(id);
      let list = await Quantrichamdiem.find({}).sort({ nam: -1 });

      res.status(200).json({ list, message: 'Thao tác xóa thành công!' });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  //xóa phiếu chấm điểm....
  resetPhieuchamdiem: async (req, res) => {
    let id = req.params.id; //id phieu cham muon xoa
    try {
      let item = await Phieuchamdiems.findById(id).populate('taikhoan');
      for (let i of item.phieuchamdiem) {
        for (let e of i.tieuchi_group) {
          for (let el of e.tieuchithanhphan) {
            if (el.files.length > 0) {
              for (let file of el.files) {
                const deleted = deleteSafeUploadFile(req.userId.userId, file);
                if (!deleted) {
                  console.warn(`Bỏ qua tệp không an toàn hoặc bị thiếu để xóa: ${file}`);
                }
              }
            }
          }
        }
      }

      if (item.chotdiemtucham.files.length > 0) {
        for (let file of item.chotdiemtucham.files) {
          const deleted = deleteSafeUploadFile(req.userId.userId, file);
          if (!deleted) {
            console.warn(`Bỏ qua tệp không an toàn hoặc bị thiếu để xóa: ${file}`);
          }
        }
      }

      await saveAction(
        req.userId.userId,
        `Reset phiếu chấm điểm của ${item.taikhoan.tenhienthi} năm ${item.year}`,
      );
      await Phieuchamdiems.findByIdAndDelete(id);
      res.status(200).json({ message: 'Xóa phiếu chấm điểm thành công!' });
    } catch (error) {}
  },

  saveUploadtailieuDiemthuong: async (req, res) => {
    let { filesSaved, filesDelete, ghichucuadonvi } = req.body;

    try {
      let { id_phieucham } = req.params;

      // 1. Chuẩn hóa tên file upload (Tương thích tốt trên cả Windows lẫn Linux/VPS)
      let files = (req.files || []).map((i) => path.basename(i.path));

      // 2. An toàn khi Parse JSON đầu vào
      let parsedFilesDelete = [];
      let parsedFilesSaved = [];

      try {
        parsedFilesDelete = filesDelete ? JSON.parse(filesDelete) : [];
        parsedFilesSaved = filesSaved ? JSON.parse(filesSaved) : [];
      } catch (parseErr) {
        return res.status(400).json({ status: 'failed', message: 'Dữ liệu JSON không hợp lệ' });
      }

      // 3. Xử lý xóa file an toàn - Chống Path Manipulation
      const safeUserId = path.basename(String(req.userId.userId));
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      for (const filename of parsedFilesDelete) {
        const safeFileName = path.basename(filename);

        // Validate ký tự tên file
        if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
          console.log(`Invalid filename: ${filename}`);
          continue;
        }

        // Đường dẫn tuyệt đối tới file cần xóa
        const filePath = path.resolve(userDir, safeFileName);

        // Kiểm tra rào chắn: File xóa bắt buộc phải nằm trong thư mục userDir
        if (!filePath.startsWith(userDir)) {
          console.warn(`Phát hiện hành vi Path Traversal từ user ${safeUserId}: ${filePath}`);
          continue;
        }

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`File ${filePath} đã được xóa thành công.`);
          } catch (err) {
            console.error(`Lỗi khi xóa file ${filePath}:`, err);
          }
        } else {
          console.log(`File ${filePath} không tồn tại.`);
        }
      }

      // Gộp danh sách file cũ giữ lại + file mới
      files = parsedFilesSaved.concat(files);

      // 4. Cập nhật Database
      let phieucham = await Phieuchamdiems.findById(id_phieucham);
      if (!phieucham) {
        return res
          .status(404)
          .json({ status: 'failed', message: 'Không tìm thấy phiếu chấm điểm' });
      }

      if (!phieucham.ghichudiemthuong) {
        phieucham.ghichudiemthuong = {};
      }

      phieucham.ghichudiemthuong.ghichucuadonvi = ghichucuadonvi;
      phieucham.ghichudiemthuong.files = files;

      await phieucham.save();
      await saveAction(req.userId.userId, `Upload tài liệu điểm thưởng`);

      res.status(200).json({
        message: 'Lưu tài liệu điểm thưởng thành công',
        files: files,
        ghichucuadonvi,
      });
    } catch (error) {
      console.error('Lỗi saveUploadtailieuDiemthuong:', error);
      res.status(500).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  saveUploadtailieuDiemphat: async (req, res) => {
    let { filesSaved, filesDelete, ghichucuadonvi } = req.body;

    try {
      let { id_phieucham } = req.params;

      // 1. Chuẩn hóa tên file upload (Tương thích tốt trên cả Windows lẫn Linux/VPS)
      let files = (req.files || []).map((i) => path.basename(i.path));

      // 2. An toàn khi Parse JSON đầu vào
      let parsedFilesDelete = [];
      let parsedFilesSaved = [];

      try {
        parsedFilesDelete = filesDelete ? JSON.parse(filesDelete) : [];
        parsedFilesSaved = filesSaved ? JSON.parse(filesSaved) : [];
      } catch (parseErr) {
        return res.status(400).json({ status: 'failed', message: 'Dữ liệu JSON không hợp lệ' });
      }

      // 3. Xử lý xóa file an toàn - Chống Path Manipulation
      const safeUserId = path.basename(String(req.userId.userId));
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      for (const filename of parsedFilesDelete) {
        const safeFileName = path.basename(filename);

        // Validate ký tự tên file
        if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
          console.log(`Invalid filename: ${filename}`);
          continue;
        }

        // Đường dẫn tuyệt đối tới file cần xóa
        const filePath = path.resolve(userDir, safeFileName);

        // Kiểm tra rào chắn: File xóa bắt buộc phải nằm trong thư mục userDir
        if (!filePath.startsWith(userDir)) {
          console.warn(`Phát hiện hành vi Path Traversal từ user ${safeUserId}: ${filePath}`);
          continue;
        }

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`File ${filePath} đã được xóa thành công.`);
          } catch (err) {
            console.error(`Lỗi khi xóa file ${filePath}:`, err);
          }
        } else {
          console.log(`File ${filePath} không tồn tại.`);
        }
      }

      // Gộp danh sách file cũ giữ lại + file mới
      files = parsedFilesSaved.concat(files);

      // 4. Cập nhật Database
      let phieucham = await Phieuchamdiems.findById(id_phieucham);
      if (!phieucham) {
        return res
          .status(404)
          .json({ status: 'failed', message: 'Không tìm thấy phiếu chấm điểm' });
      }

      if (!phieucham.ghichudiemphat) {
        phieucham.ghichudiemphat = {};
      }

      phieucham.ghichudiemphat.ghichucuadonvi = ghichucuadonvi;
      phieucham.ghichudiemphat.files = files;

      await phieucham.save();
      await saveAction(req.userId.userId, `Upload tài liệu điểm phạt`);

      res.status(200).json({
        message: 'Lưu tài liệu điểm phạt thành công',
        files: files,
        ghichucuadonvi,
      });
    } catch (error) {
      console.error('Lỗi saveUploadtailieuDiemphat:', error);
      res.status(500).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  saveUploadtailieuDiemthuongGiaitrinh: async (req, res) => {
    let { filesSaved, filesDelete, ghichucuadonvi } = req.body;

    try {
      let { id } = req.params;

      // 1. Lấy tên file upload chuẩn xác trên cả Windows & Linux
      let files = (req.files || []).map((i) => path.basename(i.path));

      // 2. Safely parse JSON inputs
      let parsedFilesDelete = [];
      let parsedFilesSaved = [];

      try {
        parsedFilesDelete = filesDelete ? JSON.parse(filesDelete) : [];
        parsedFilesSaved = filesSaved ? JSON.parse(filesSaved) : [];
      } catch (parseErr) {
        return res.status(400).json({ status: 'failed', message: 'Dữ liệu JSON không hợp lệ' });
      }

      // 3. Khóa đường dẫn an toàn - Chống Path Manipulation
      const safeUserId = path.basename(String(req.userId.userId));
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      for (const filename of parsedFilesDelete) {
        const safeFileName = path.basename(filename);

        if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
          console.log(`Invalid filename: ${filename}`);
          continue;
        }

        const filePath = path.resolve(userDir, safeFileName);

        // Kiểm tra rào chắn an toàn
        if (!filePath.startsWith(userDir)) {
          console.warn(`Phát hiện Path Traversal từ user ${safeUserId}: ${filePath}`);
          continue;
        }

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`The file ${filePath} exists and was deleted.`);
          } catch (err) {
            console.error(`Error deleting file ${filePath}:`, err);
          }
        } else {
          console.log(`The file ${filePath} does not exist.`);
        }
      }

      files = parsedFilesSaved.concat(files);

      // 4. Update DB
      let phieucham = await Phieuchamdiems.findById(id);
      if (!phieucham) {
        return res
          .status(404)
          .json({ status: 'failed', message: 'Không tìm thấy phiếu chấm điểm' });
      }

      if (!phieucham.ghichudiemthuonggiaitrinh) {
        phieucham.ghichudiemthuonggiaitrinh = {};
      }

      phieucham.ghichudiemthuonggiaitrinh.ghichucuadonvi = ghichucuadonvi;
      phieucham.ghichudiemthuonggiaitrinh.files = files;

      await phieucham.save();
      await saveAction(req.userId.userId, `Upload tài liệu điểm thưởng giải trình`);

      res.status(200).json({
        message: 'Lưu tài liệu điểm thưởng giải trình thành công',
        files: files,
        ghichucuadonvi,
      });
    } catch (error) {
      console.error('Lỗi saveUploadtailieuDiemthuongGiaitrinh:', error);
      res.status(500).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  saveUploadtailieuDiemphatGiaitrinh: async (req, res) => {
    let { filesSaved, filesDelete, ghichucuadonvi } = req.body;

    try {
      let { id } = req.params;

      // 1. Lấy tên file upload chuẩn xác trên cả Windows & Linux
      let files = (req.files || []).map((i) => path.basename(i.path));

      // 2. Safely parse JSON inputs
      let parsedFilesDelete = [];
      let parsedFilesSaved = [];

      try {
        parsedFilesDelete = filesDelete ? JSON.parse(filesDelete) : [];
        parsedFilesSaved = filesSaved ? JSON.parse(filesSaved) : [];
      } catch (parseErr) {
        return res.status(400).json({ status: 'failed', message: 'Dữ liệu JSON không hợp lệ' });
      }

      // 3. Khóa đường dẫn an toàn - Chống Path Manipulation
      const safeUserId = path.basename(String(req.userId.userId));
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      for (const filename of parsedFilesDelete) {
        const safeFileName = path.basename(filename);

        if (!safeFileName || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFileName)) {
          console.log(`Invalid filename: ${filename}`);
          continue;
        }

        const filePath = path.resolve(userDir, safeFileName);

        // Kiểm tra rào chắn an toàn
        if (!filePath.startsWith(userDir)) {
          console.warn(`Phát hiện Path Traversal từ user ${safeUserId}: ${filePath}`);
          continue;
        }

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`The file ${filePath} exists and was deleted.`);
          } catch (err) {
            console.error(`Error deleting file ${filePath}:`, err);
          }
        } else {
          console.log(`The file ${filePath} does not exist.`);
        }
      }

      files = parsedFilesSaved.concat(files);

      // 4. Update DB
      let phieucham = await Phieuchamdiems.findById(id);
      if (!phieucham) {
        return res
          .status(404)
          .json({ status: 'failed', message: 'Không tìm thấy phiếu chấm điểm' });
      }

      if (!phieucham.ghichudiemphatgiaitrinh) {
        phieucham.ghichudiemphatgiaitrinh = {};
      }

      phieucham.ghichudiemphatgiaitrinh.ghichucuadonvi = ghichucuadonvi;
      phieucham.ghichudiemphatgiaitrinh.files = files;

      await phieucham.save();
      await saveAction(req.userId.userId, `Upload tài liệu điểm phạt giải trình`);

      res.status(200).json({
        message: 'Lưu tài liệu điểm phạt giải trình thành công',
        files: files,
        ghichucuadonvi,
      });
    } catch (error) {
      console.error('Lỗi saveUploadtailieuDiemphatGiaitrinh:', error);
      res.status(500).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  updateGhichuthamdinhDiemthuong: async (req, res) => {
    let { ghichucuathamdinh } = req.body;
    // console.log(req.body)
    try {
      let { id } = req.params;
      // console.log(id)
      let phieucham = await Phieuchamdiems.findById(id);
      phieucham.ghichudiemthuong.ghichucuathamdinh = ghichucuathamdinh;
      await phieucham.save();
      await saveAction(req.userId.userId, `Thêm ghi chú thẩm định điểm thưởng`);
      res
        .status(200)
        .json({ message: 'Lưu ghi chú thẩm định điểm thưởng thành công', ghichucuathamdinh });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  updateGhichuthamdinhDiemphat: async (req, res) => {
    let { ghichucuathamdinh } = req.body;
    // console.log(id_linhvuc)
    try {
      let { id } = req.params;
      // console.log(id)
      let phieucham = await Phieuchamdiems.findById(id);

      phieucham.ghichudiemphat.ghichucuathamdinh = ghichucuathamdinh;

      await phieucham.save();
      await saveAction(req.userId.userId, `Thêm ghi chú thẩm định điểm phạt`);
      res
        .status(200)
        .json({ message: 'Lưu ghi chú thẩm định điểm phạt thành công', ghichucuathamdinh });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  updateGhichuThamdinhDiemthuongGiaitrinh: async (req, res) => {
    let { ghichucuathamdinh } = req.body;
    // console.log(req.body)
    try {
      let { id } = req.params;
      // console.log(id)
      let phieucham = await Phieuchamdiems.findById(id);
      phieucham.ghichudiemthuonggiaitrinh.ghichucuathamdinh = ghichucuathamdinh;
      await phieucham.save();
      await saveAction(req.userId.userId, `Thêm ghi chú thẩm định điểm thưởng giải trình`);
      res.status(200).json({
        message: 'Lưu ghi chú thẩm định điểm thưởng giải trình thành công',
        ghichucuathamdinh,
      });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  updateGhichuThamdinhDiemphatGiaitrinh: async (req, res) => {
    let { ghichucuathamdinh } = req.body;
    // console.log(id_linhvuc)
    try {
      let { id } = req.params;
      // console.log(id)
      let phieucham = await Phieuchamdiems.findById(id);

      phieucham.ghichudiemphatgiaitrinh.ghichucuathamdinh = ghichucuathamdinh;

      await phieucham.save();
      await saveAction(req.userId.userId, `Thêm ghi chú thẩm định điểm phạt giải trình`);
      res.status(200).json({
        message: 'Lưu ghi chú thẩm định điểm phạt giải trình thành công',
        ghichucuathamdinh,
      });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  fetchFileUploadTucham: async (req, res) => {
    let { year } = req.query;
    year = Number(year);
    try {
      let user = await Users.findById(req.params.id);
      let cap = user.taikhoancap[0];
      let item = await Phieuchamdiems.findOne({ year, taikhoan: req.params.id })
        .populate('phieuchamdiem.linhvuc')
        .populate('phieuchamdiem.tieuchi_group.tieuchi')
        .populate('phieuchamdiem.tieuchi_group.tieuchithanhphan.tieuchithanhphan');
      // console.log(item.phieuchamdiem[0].tieuchi_group[0].tieuchithanhphan)
      if (!item) {
        let phieuchamdiem = [];
        res.status(200).json({
          data: phieuchamdiem,
          id_phieucham: '',
          chotdiemtucham: false,
          captaikhoan: cap,
        });
      } else {
        let data = [];
        let list = item.phieuchamdiem;
        // console.log(list[0].tieuchi_group[0].tieuchithanhphan)
        for (let i of list) {
          //check xem lĩnh vực nào được sử dụng cho cấp, cho năm
          let tieuchi_group = i.tieuchi_group;
          let tieuchiList = [];

          for (let tieuchi of tieuchi_group) {
            let tieuchithanhphan = [];
            if (cap === 'xã') {
              //TH cấp xã
              tieuchithanhphan = tieuchi.tieuchithanhphan.map((e) => ({
                tentieuchi: e.tieuchithanhphan.tentieuchi,
                phanloaidanhgia: e.tieuchithanhphan.phanloaidanhgiacapxa,
                files: e.files,
                _id: e.tieuchithanhphan._id,
              }));
            } else if (cap === 'huyện') {
              tieuchithanhphan = tieuchi.tieuchithanhphan.map((e) => ({
                tentieuchi: e.tieuchithanhphan.tentieuchi,
                phanloaidanhgia: e.tieuchithanhphan.phanloaidanhgiacaphuyen,
                files: e.files,
                _id: e.tieuchithanhphan._id,
              }));
            } else {
              tieuchithanhphan = tieuchi.tieuchithanhphan.map((e) => ({
                tentieuchi: e.tieuchithanhphan.tentieuchi,
                phanloaidanhgia: e.tieuchithanhphan.phanloaidanhgia,
                files: e.files,
                _id: e.tieuchithanhphan._id,
              }));
            }

            tieuchiList.push({
              tieuchi: { ...tieuchi.tieuchi._doc },
              tieuchithanhphan,
            });
          }

          data.push({
            linhvuc: { ...i.linhvuc._doc },
            tieuchi_group: tieuchiList,
          });
        }
        res.status(200).json({
          data,
          id_phieucham: item._id,
          captaikhoan: cap,
          chotdiemtucham: item.chotdiemtucham.status,
        });
      }
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },

  saveTailieuUpload: async (req, res) => {
    try {
      let { id_linhvuc, idPhieucham, id_tieuchi, tieuchithanhphan } = req.body;
      // console.log(req.files)
      let phieucham = await Phieuchamdiems.findById(idPhieucham);
      let linhvuc = phieucham.phieuchamdiem.find((i) => i.linhvuc.toString() === id_linhvuc);
      let tieuchi = linhvuc.tieuchi_group.find((i) => i.tieuchi._id.toString() === id_tieuchi);
      let tieuchithanhphandb = tieuchi.tieuchithanhphan.find(
        (i) => i.tieuchithanhphan.toString() === tieuchithanhphan,
      );
      let files = req.files.map((i) => {
        let path = i.path;
        let index = path.lastIndexOf('\\');
        return path.slice(index + 1);
      });
      tieuchithanhphandb.files = tieuchithanhphandb.files.concat(files);
      await phieucham.save();
      // console.log(req.files)
      await saveAction(
        req.userId.userId,
        `Thêm tài liệu kiểm chứng ${req.files.map((i) => i.filename).toString()}`,
      );
      res.status(200).json({ message: 'Lưu tài liệu thành công' });
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  deleteTailieuUpload: async (req, res) => {
    try {
      let { id_linhvuc, idPhieucham, id_tieuchi, file, tieuchithanhphan } = req.body;

      if (!file) {
        return res.status(400).json({ status: 'failed', message: 'Thiếu tên file cần xóa.' });
      }

      let phieucham = await Phieuchamdiems.findById(idPhieucham);
      if (!phieucham) {
        return res.status(404).json({ status: 'failed', message: 'Không tìm thấy phiếu chấm.' });
      }

      let linhvuc = phieucham.phieuchamdiem.find((i) => i.linhvuc.toString() === id_linhvuc);
      let tieuchi = linhvuc?.tieuchi_group.find((i) => i.tieuchi._id.toString() === id_tieuchi);
      let tieuchithanhphandb = tieuchi?.tieuchithanhphan.find(
        (i) => i.tieuchithanhphan.toString() === tieuchithanhphan,
      );

      // 1. Làm sạch tên file và UserId để chống Path Manipulation
      const safeFileName = path.basename(String(file));
      const safeUserId = path.basename(String(req.userId.userId));

      // Validate định dạng tên file
      const safeFilenamePattern = /^[a-zA-Z0-9_\-\.]+$/;
      if (!safeFilenamePattern.test(safeFileName)) {
        return res.status(400).json({ status: 'failed', message: 'Tên file không hợp lệ.' });
      }

      // 2. Xác định đường dẫn thư mục user an toàn
      const uploadBaseDir = path.resolve(__dirname, '../upload');
      const userDir = path.resolve(uploadBaseDir, safeUserId);

      // 3. Đường dẫn file tuyệt đối
      const path_delete = path.resolve(userDir, safeFileName);

      // 4. Rào chắn bảo vệ: Kiểm tra path_delete có thực sự nằm trong userDir
      if (!path_delete.startsWith(userDir)) {
        console.warn(`Phát hiện hành vi Path Traversal từ user ${safeUserId}: ${path_delete}`);
        return res.status(403).json({ status: 'failed', message: 'Đường dẫn file không hợp lệ.' });
      }

      // 5. Kiểm tra và xóa file vật lý
      if (fs.existsSync(path_delete)) {
        fs.unlinkSync(path_delete);
      }

      // 6. Cập nhật cơ sở dữ liệu
      if (tieuchithanhphandb) {
        tieuchithanhphandb.files = tieuchithanhphandb.files.filter(
          (i) => i !== file && i !== safeFileName,
        );
        await phieucham.save();
      }

      await saveAction(req.userId.userId, `Xóa tài liệu kiểm chứng ${safeFileName}`);
      return res.status(200).json({ message: 'Xóa tài liệu thành công' });
    } catch (error) {
      console.error('Lỗi deleteTailieuUpload:', error);
      return res.status(500).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
  fetchLichsuHethong: async (req, res) => {
    try {
      let { tentaikhoan, tungay, denngay, action, id } = req.query;
      // console.log(id)
      const schema = Joi.object({
        id: Joi.string().required(),
        action: Joi.string().optional(),
        tungay: Joi.string().optional(),
        denngay: Joi.string().optional(),
      });

      const { error, value } = schema.validate({
        id: id,
        tungay,
        denngay,
      });
      tungay = value.tungay;
      denngay = value.denngay;
      if (error) {
        return res
          .status(400)
          .json({ status: false, message: 'Lỗi giá trị đầu vào' + error.message });
      }
      if (tungay === '') {
        tungay = new Date('1970-01-01T00:00:00Z');
      } else {
        tungay = new Date(`${tungay}T00:00:00Z`);
      }
      // console.log(action)
      denngay = new Date(`${denngay}T23:59:59Z`);

      let accounts_con = await Users.find({ capcha: value.id });
      accounts_con = accounts_con.map((i) => i._id);
      let items = await HistoriesSystem.find({
        action: { $regex: value.action, $options: 'i' },
        user: { $in: accounts_con },
        createdAt: {
          $gte: tungay,
          $lte: denngay,
        },
      })
        .populate('user')
        .sort({ createdAt: -1 });
      // console.log(items[0])
      items = items.filter(
        (i) => i.user.tenhienthi.toLowerCase().indexOf(tentaikhoan.toLowerCase()) !== -1,
      );
      res.status(200).json(items);
    } catch (error) {
      console.log('lỗi: ', error.message);
      res.status(401).json({
        status: 'failed',
        message: error.message,
      });
    }
  },
};
