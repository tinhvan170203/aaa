const jwt = require("jsonwebtoken");
const RefreshTokens = require("../models/RefreshToken");
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const Users = require("../models/Users");
const _ = require('lodash');
const Phieuchamdiems = require("../models/Phieuchamdiem");
const HistoriesSystem = require("../models/HistoriesSystem");
const QuantriNamChamdiem = require("../models/QuanlyNamChamdiem");
const saveAction = async (user_id, action) => {
  let newAction = new HistoriesSystem({
    user: user_id,
    action: action
  })
  await newAction.save();
};

const Joi = require('joi');
function isInsideBaseDir(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
// Hàm kiểm tra định dạng ID hợp lệ (ví dụ MongoDB ObjectId)
function isValidObjectId(id) {
  return /^[a-fA-F0-9]{24}$/.test(id);
};

console.log(process.env.ACCESS_TOKEN)
module.exports = {
  login: async (req, res) => {
    try {
      const schema = Joi.object({
        tentaikhoan: Joi.string().required(),
        matkhau: Joi.string().required()
      });

      const { error, value } = schema.validate({
        tentaikhoan: req.body.tentaikhoan,
        matkhau: req.body.matkhau,
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị nhập vào từ người dùng. Vui lòng kiểm tra lại' });
      }
      // console.log(value)
      let user = await Users.findOne(value).populate('capcha');
      if (!user) {
        return res.status(401).json({ status: false, message: "Sai tên đăng nhập hoặc mật khẩu" });
      } else {
        if (user.block_by_admin === true) {
          return res.status(401).json({ status: false, message: "Tài khoản bị khóa bởi quản trị hệ thống, vui lòng liên hệ cơ quan cấp trên" })
        };
        if (user.status === false) {
          return res.status(401).json({ status: false, message: "Tài khoản bị khóa, vui lòng liên hệ cơ quan cấp trên" })
        };

        //cần kiểm tra xem client có refreshtoken k nếu có thì phải kiểm tra db và xóa đi khi login thành công và tạo mới refreshtoken
        let refreshTokenCookie = req.cookies.refreshToken;
        if (refreshTokenCookie) {
          await RefreshTokens.findOneAndDelete({ refreshToken: refreshTokenCookie })
        };

        //generate accessToken, refreshToken
        const accessToken = jwt.sign({ userId: user._id }, process.env.ACCESS_TOKEN, {
          expiresIn: '30m'
        });


        const refreshToken = jwt.sign({ userId: user._id },process.env.REFRESH_TOKEN, {
          expiresIn: '30d'
        });

        let newItem = new RefreshTokens({
          refreshToken
        });
        await newItem.save();
        await saveAction(user._id, "Đăng nhập hệ thống");
        res.status(200).json({ status: "success", _id: user._id, thamdinhkhuvuc: user.role, captaikhoan: user.taikhoancap, tentaikhoan: user.tenhienthi, accessToken, refreshToken });
      }
    } catch (error) {
      console.log(error.message)
      res.status(401).json({ status: "failed", message: "Lỗi đăng nhập hệ thống" });
    }
  },
  logout: async (req, res) => {
    //xóa refreshTonken trong database
    let refreshTokenCookie = req.cookies.refreshToken;
    try {
      if (refreshTokenCookie) {
        await RefreshTokens.findOneAndDelete({ refreshToken: refreshTokenCookie })
      };

      //xóa cookie
      // res.clearCookie('refreshToken_px01');
      res.status(200).json({ status: "success", message: "Đăng xuất thành công" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Lỗi server hệ thống" });
    }
  },
  getUserList: async (req, res) => {
    try {
      let users = await Users.find({
        "taikhoancap": { $in: ["Cấp Bộ", "Cấp Cục", "Cấp Tỉnh"] }
      }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });
// console.log('123')
      res.status(200).json(users)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Có lỗi xảy ra khi lấy dữ liệu người dùng" });
    }
  },
  //Hàm tạo ra các tài khoản cấp Bộ và Cục, Tỉnh
  addUser: async (req, res) => {
    let { tentaikhoan, id_user, madonvi, role, tenhienthi, taikhoancap, status, nhom, thutu, cotailieunghiepvu } = req.body;
    try {
      let newItem = new Users({
        tentaikhoan,
        tenhienthi,
        cotailieunghiepvu,
        nhom,
        matkhau: '123456',
        thutu,
        taikhoancap,
        capcha: id_user,
        status,
        role,
        madonvi,
        block_by_admin: false
      });

      try {
        fs.mkdirSync(
          path.join(__dirname, `../upload/${newItem._id}`)
        );
        console.log('Folder created successfully (sync)!');
      } catch (err) {
        console.error('Error creating folder (sync):', err);
      };
      await newItem.save();
      await saveAction(req.userId.userId, `Thêm mới tài khoản ${tenhienthi}`);

      //lọc ra các 
      let users = await Users.find({
        "taikhoancap": { $in: ["Cấp Bộ", "Cấp Cục", "Cấp Tỉnh"] }
      }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });
      res.status(200).json({ status: "success", users, message: "Thêm mới thành công" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Có lỗi xảy ra khi thêm mới người dùng" });
    }
  },
  editUser: async (req, res) => {
    let id = req.params.id;
    let { tentaikhoan, madonvi, tenhienthi,role, taikhoancap, nhom, status, thutu,cotailieunghiepvu } = req.body;
    // console.log(thutu)
    try {
      await Users.findByIdAndUpdate(id, {
        tentaikhoan,
        // thutu: Number(thutu),
        cotailieunghiepvu,
        role,
        taikhoancap,
        status,
        nhom,
        role,
        tenhienthi,
        madonvi
      });
      // console.log('update')
      let users = await Users.find({
        "taikhoancap": { $in: ["Cấp Bộ", "Cấp Cục", "Cấp Tỉnh"] }
      }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });
      await saveAction(req.userId.userId, `Chỉnh sửa tài khoản ${tenhienthi}`)
      res.status(200).json({ status: "success", users, message: "Cập nhật tài khoản người dùng thành công" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Có lỗi xảy ra khi cập nhật tài khoản người dùng" });
    }
  },
// deleteUser: async (req, res) => {
//     const { id } = req.params;

//     const schema = Joi.object({
//       id: Joi.string().required(),
//     });

//     const { error, value } = schema.validate({ id });
//     if (error) {
//       return res.status(400).json({ status: false, message: 'Lỗi giá trị nhập vào từ người dùng. Vui lòng kiểm tra lại' });
//     }

//     try {
//       let item = await Users.findById(value.id);
//       if (!item) {
//         return res.status(404).json({ status: "failed", message: "Không tìm thấy người dùng cần xóa" });
//       }

//       // Kiểm tra tài khoản cấp dưới trực thuộc
//       let checked = await Users.findOne({
//         taikhoancap: { $in: ["Cấp Phòng", "Cấp Xã"] },
//         capcha: value.id
//       });

//       if (checked !== null) {
//         return res.status(400).json({ status: "failed", message: "Không thể xóa tài khoản do có tài khoản cấp dưới đang thuộc tài khoản bạn muốn xóa." });
//       }

//       const uploadBaseDir = path.resolve(__dirname, "../upload");

//       // Hàm xóa thư mục an toàn tuyệt đối - Chống Path Manipulation & Xóa đệ quy
//       const safeRemoveFolder = (targetFolderId) => {
//         if (!targetFolderId) return;

//         const safeId = path.basename(String(targetFolderId)).replace(/[^a-zA-Z0-9_-]/g, '');
//         if (!safeId) return;

//         const targetPath = path.resolve(uploadBaseDir, safeId);

//         // Rào chắn bảo vệ Fortify: Thư mục bắt buộc nằm trong uploadBaseDir
//         if (targetPath.startsWith(uploadBaseDir) && targetPath !== uploadBaseDir && fs.existsSync(targetPath)) {
//           try {
//             // Dùng rmSync đệ quy để xóa sạch folder dù chứa nhiều file/subfolder
//             fs.rmSync(targetPath, { recursive: true, force: true });
//             console.log(`Đã xóa thư mục an toàn: ${targetPath}`);
//           } catch (err) {
//             console.error(`Lỗi khi xóa thư mục ${targetPath}:`, err);
//           }
//         }
//       };

//       // 1. Xóa thư mục upload của các tài khoản con (nếu có)
//       let user_list_con = await Users.find({ capcha: value.id });
//       let id_user_list_con = user_list_con.map(i => i._id);

//       for (let childUser of user_list_con) {
//         if (isValidObjectId(childUser._id)) {
//           safeRemoveFolder(childUser._id);
//         }
//       }

//       if (id_user_list_con.length > 0) {
//         await QuantriNamChamdiem.deleteMany({ user_created: { $in: id_user_list_con } });
//         await Phieuchamdiems.deleteMany({ taikhoan: { $in: id_user_list_con } });
//       }

//       // 2. Xóa thư mục upload của chính tài khoản cha
//       if (isValidObjectId(value.id)) {
//         safeRemoveFolder(value.id);
//       }

//       // 3. Xóa chữ ký / con dấu của User (nếu có)
//       if (item.signatureImg) {
//         const signatureDir = path.resolve(__dirname, "../signatures");
//         ["chuky", "condau"].forEach(key => {
//           if (item.signatureImg[key]) {
//             const safeSigName = path.basename(item.signatureImg[key]);
//             const sigPath = path.resolve(signatureDir, safeSigName);
//             if (sigPath.startsWith(signatureDir) && fs.existsSync(sigPath)) {
//               try { fs.unlinkSync(sigPath); } catch (e) {}
//             }
//           }
//         });
//       }

//       // 4. Xóa dữ liệu liên quan và User trong Database
//       await QuantriNamChamdiem.deleteMany({ user_created: item._id });
//       await Phieuchamdiems.deleteMany({ taikhoan: item._id });
//       await Users.findByIdAndDelete(value.id);

//       await saveAction(req.userId.userId, `Xóa tài khoản ${item.tentaikhoan}`);

//       let users = await Users.find({
//         "taikhoancap": { $in: ["Cấp Bộ", "Cấp Cục", "Cấp Tỉnh"] }
//       }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });

//       return res.status(200).json({ status: "success", users, message: "Xóa tài khoản người dùng thành công" });

//     } catch (error) {
//       console.error("Lỗi deleteUser:", error);
//       return res.status(500).json({ status: "failed", message: "Có lỗi xảy ra khi xóa người dùng" });
//     }
//   },
  deleteUser: async (req, res) => {
  const { id } = req.params;

  const schema = Joi.object({
    id: Joi.string().required(),
  });

  const { error, value } = schema.validate({ id });
  if (error) {
    return res.status(400).json({ status: false, message: 'Lỗi giá trị nhập vào từ người dùng. Vui lòng kiểm tra lại' });
  }

  // // Validate id đúng định dạng ObjectId trước khi dùng cho bất kỳ việc gì
  // if (!mongoose.Types.ObjectId.isValid(value.id)) {
  //   return res.status(400).json({ status: false, message: 'id không hợp lệ' });
  // }

  try {
    let item = await Users.findById(value.id);
    if (!item) {
      return res.status(404).json({ status: "failed", message: "Không tìm thấy người dùng cần xóa" });
    }

    // Kiểm tra tài khoản cấp dưới trực thuộc
    let checked = await Users.findOne({
      // taikhoancap: { $in: ["Cấp Phòng", "Cấp Xã"] },
      capcha: value.id
    });

    if (checked !== null) {
      return res.status(400).json({ status: "failed", message: "Không thể xóa tài khoản do có tài khoản cấp dưới đang thuộc tài khoản bạn muốn xóa." });
    }

    const uploadBaseDir = path.resolve(__dirname, "../upload");

    // Hàm xóa thư mục an toàn tuyệt đối - Chống Path Manipulation & Xóa đệ quy
    const safeRemoveFolder = (targetFolderId) => {
      if (!targetFolderId) return;

      const safeId = path.basename(String(targetFolderId)).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeId) return;

      const targetPath = path.resolve(uploadBaseDir, safeId);

      // Rào chắn bảo vệ: dùng path.relative thay vì startsWith
      if (isInsideBaseDir(uploadBaseDir, targetPath) && fs.existsSync(targetPath)) {
        try {
          fs.rmSync(targetPath, { recursive: true, force: true });
          console.log(`Đã xóa thư mục an toàn: ${targetPath}`);
        } catch (err) {
          console.error(`Lỗi khi xóa thư mục ${targetPath}:`, err);
        }
      }
    };

    // 1. Xóa thư mục upload của các tài khoản con (nếu có)
    // let user_list_con = await Users.find({ capcha: value.id });
    // let id_user_list_con = user_list_con.map(i => i._id);

    // for (let childUser of user_list_con) {
    //   if (isValidObjectId(childUser._id)) {
    //     safeRemoveFolder(childUser._id);
    //   }
    // }

    // if (id_user_list_con.length > 0) {
    //   await QuantriNamChamdiem.deleteMany({ user_created: { $in: id_user_list_con } });
    //   await Phieuchamdiems.deleteMany({ taikhoan: { $in: id_user_list_con } });
    // }

    // 2. Xóa thư mục upload của chính tài khoản cha
    if (isValidObjectId(value.id)) {
      safeRemoveFolder(value.id);
    }

    // 3. Xóa chữ ký / con dấu của User (nếu có)
    if (item.signatureImg) {
      const signatureDir = path.resolve(__dirname, "../signatures");
      ["chuky", "condau"].forEach(key => {
        if (item.signatureImg[key]) {
          const safeSigName = path.basename(item.signatureImg[key]);
          const sigPath = path.resolve(signatureDir, safeSigName);
          // Sửa: dùng path.relative thay vì startsWith
          if (isInsideBaseDir(signatureDir, sigPath) && fs.existsSync(sigPath)) {
            try { fs.unlinkSync(sigPath); } catch (e) {}
          }
        }
      });
    }

    // 4. Xóa dữ liệu liên quan và User trong Database
    // await QuantriNamChamdiem.deleteMany({ user_created: item._id });
    // await Phieuchamdiems.deleteMany({ taikhoan: item._id });
    // await Users.findByIdAndDelete(value.id);
    await Promise.all([
      QuantriNamChamdiem.deleteMany({ user_created: item._id }),
      Phieuchamdiems.deleteMany({ taikhoan: item._id }),
      Users.findByIdAndDelete(value.id)
    ]);

    await saveAction(req.userId.userId, `Xóa tài khoản ${item.tentaikhoan}`);

    let users = await Users.find({
      "taikhoancap": { $in: ["Cấp Bộ", "Cấp Cục", "Cấp Tỉnh"] }
    }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });

    return res.status(200).json({ status: "success", users, message: "Xóa tài khoản người dùng thành công" });

  } catch (error) {
    console.error("Lỗi deleteUser:", error);
    return res.status(500).json({ status: "failed", message: "Có lỗi xảy ra khi xóa người dùng" });
  }
},
changeStatusAccounts: async (req, res) => {
    let { data } = req.body;
    try {
      for (let i of data) {
        let item = await Users.findById(i);
        // console.log(item)
        item.status = !item.status;
        item.time_block = new Date()
        await item.save();
      };
      let users = await Users.find({
        "taikhoancap": { $in: ["Cấp Bộ", "Cấp Cục", "Cấp Tỉnh"] }
      }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });
      res.status(200).json({ users, message: "Thay đổi trạng thái hoạt động thành công!" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: error.message,
      });
    }
  },
  //Hàm tạo tài khoản cấp phòng, xã của các tài khoản cấp tỉnh
  getUserListOfCapTinh: async (req, res) => {
    let id_user = req.query.id_user;

    const schema = Joi.object({
      id_user: Joi.string().required(),
    });

    const { error, value } = schema.validate({
      id_user: id_user,
    });
    if (error) {
      return res.status(400).json({ status: false, message: 'Lỗi giá trị id_user' });
    };

    try {
      let users = await Users.find({
        "taikhoancap": { $in: ["Cấp Phòng", "Cấp Xã"] },
        capcha: value.id_user
      }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });

      res.status(200).json(users)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Có lỗi xảy ra khi lấy dữ liệu người dùng" });
    }
  },
  // addUserOfCapTinh: async (req, res) => {
  //   let { tentaikhoan, id_user, madonvi, tenhienthi, taikhoancap, status, nhom, thutu } = req.body;
  //   try {
  //     let newItem = new Users({
  //       tentaikhoan,
  //       tenhienthi,
  //       nhom,
  //       matkhau: '123456',
  //       thutu,
  //       taikhoancap,
  //       capcha: id_user,
  //       status,
  //       madonvi,
  //       block_by_admin: false
  //     });
  //     await newItem.save();
  //     await saveAction(req.userId.userId, `Thêm mới tài khoản ${tenhienthi}`);
  //     try {
  //       fs.mkdirSync(
  //         path.join(__dirname, `../upload/${newItem._id}`)
  //       );
  //       console.log('Folder created successfully (sync)!');
  //     } catch (err) {
  //       console.error('Error creating folder (sync):', err);
  //     }
  //     //lọc ra các 

  //     const schema = Joi.object({
  //       id_user: Joi.string().required(),
  //     });

  //     const { error, value } = schema.validate({
  //       id_user: id_user,
  //     });
  //     if (error) {
  //       return res.status(400).json({ status: false, message: 'Lỗi giá trị id_user' });
  //     };
  //     let users = await Users.find({
  //       "taikhoancap": { $in: ["Cấp Phòng", "Cấp Xã"] },
  //       capcha: value.id_user
  //     }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });
  //     res.status(200).json({ status: "success", users, message: "Thêm mới thành công" })
  //   } catch (error) {
  //     console.log("lỗi: ", error.message);
  //     res.status(401).json({ status: "failed", message: "Có lỗi xảy ra khi thêm mới người dùng" });
  //   }
  // },
 addUserOfCapTinh: async (req, res) => {
  let { tentaikhoan, id_user, madonvi, tenhienthi, taikhoancap, status, nhom, thutu } = req.body;
  try {
    // Validate id_user trước, vì nó được dùng làm capcha và join vào query bên dưới
    const schema = Joi.object({
      id_user: Joi.string().required(),
    });

    const { error, value } = schema.validate({ id_user });
    if (error) {
      return res.status(400).json({ status: false, message: 'Lỗi giá trị id_user' });
    }

    let newItem = new Users({
      tentaikhoan,
      tenhienthi,
      nhom,
      matkhau: '123456',
      thutu,
      taikhoancap,
      capcha: id_user,
      status,
      madonvi,
      block_by_admin: false
    });
    await newItem.save();
    await saveAction(req.userId.userId, `Thêm mới tài khoản ${tenhienthi}`);

    // Tạo thư mục upload an toàn cho newItem._id
    // (_id do Mongoose tự sinh, nhưng vẫn validate + rào chắn để tránh
    // scanner cảnh báo Path Manipulation, và phòng thủ chiều sâu)
    const uploadBaseDir = path.resolve(__dirname, "../upload");
    const folderId = newItem._id.toString();

    if (/^[a-fA-F0-9]{24}$/.test(folderId)) {
      const targetPath = path.resolve(uploadBaseDir, path.basename(folderId));

      if (isInsideBaseDir(uploadBaseDir, targetPath)) {
        try {
          fs.mkdirSync(targetPath);
          console.log('Folder created successfully (sync)!');
        } catch (err) {
          console.error('Error creating folder (sync):', err);
        }
      }
    }

    let users = await Users.find({
      "taikhoancap": { $in: ["Cấp Phòng", "Cấp Xã"] },
      capcha: value.id_user
    }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });
    res.status(200).json({ status: "success", users, message: "Thêm mới thành công" })
  } catch (error) {
    console.log("lỗi: ", error.message);
    res.status(401).json({ status: "failed", message: "Có lỗi xảy ra khi thêm mới người dùng" });
  }
},

  editUserOfCapTinh: async (req, res) => {
    let id = req.params.id;
    let { tentaikhoan, madonvi, tenhienthi, nhom, id_user, status, thutu } = req.body;

    try {
      await Users.findByIdAndUpdate(id, {
        tentaikhoan,
        thutu,
        tenhienthi,
        status,
        nhom,
        madonvi
      });

      const schema = Joi.object({
        id_user: Joi.string().required(),
      });

      const { error, value } = schema.validate({
        id_user: id_user,
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị id_user' });
      };
      let users = await Users.find({
        "taikhoancap": { $in: ["Cấp Phòng", "Cấp Xã"] },
        capcha: value.id_user
      }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });
      await saveAction(req.userId.userId, `Chỉnh sửa tài khoản ${tenhienthi}`)
      res.status(200).json({ status: "success", users, message: "Cập nhật tài khoản người dùng thành công" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Có lỗi xảy ra khi cập nhật tài khoản người dùng" });
    }
  },
  deleteUserOfCapTinh: async (req, res) => {
  const { id } = req.params;
  const { id_user } = req.query;

  try {
    // 1. Validate tham số query đầu vào trước khi thực thi
    const schema = Joi.object({
      id_user: Joi.string().required(),
    });

    const { error, value } = schema.validate({ id_user });
    if (error) {
      return res.status(400).json({ status: false, message: 'Lỗi giá trị id_user không hợp lệ' });
    }

    // 2. Tìm người dùng
    let item = await Users.findById(id);
    if (!item) {
      return res.status(400).json({ status: false, message: 'Không tìm thấy người dùng' });
    }

    // 3. Xóa các phiếu chấm điểm của tài khoản đó
    if (item && item._id) {
      await Phieuchamdiems.deleteMany({
        taikhoan: item._id
      });
    }

    // 4. Xóa thư mục chứa tài liệu upload của user (An toàn chống Path Manipulation)
    if (isValidObjectId(id)) {
      // Chuẩn hóa loại bỏ ký tự điều hướng thư mục
      const safeFolderId = path.basename(String(id)).replace(/[^a-zA-Z0-9_-]/g, '');

      const uploadDir = path.resolve(__dirname, "../upload");
      const finalPath = path.resolve(uploadDir, safeFolderId);

      // Rào chắn kiểm tra: finalPath bắt buộc phải thuộc uploadDir
      if (finalPath.startsWith(uploadDir) && finalPath !== uploadDir) {
        if (fs.existsSync(finalPath)) {
          try {
            // Dùng rmSync với recursive: true để xóa thư mục kể cả khi bên trong có file
            fs.rmSync(finalPath, { recursive: true, force: true });
            console.log(`Đã xóa thư mục upload: ${finalPath}`);
          } catch (err) {
            console.error('Lỗi khi xóa thư mục:', err);
          }
        }
      } else {
        console.error('Cảnh báo Path Traversal phát hiện:', finalPath);
      }
    } else {
      console.error('ID thư mục không hợp lệ:', id);
    }

    // 5. Xóa user trong database
    await Users.findByIdAndDelete(id);

    // 6. Ghi log hành động
    await saveAction(req.userId.userId, `Xóa tài khoản ${item.tentaikhoan}`);

    // 7. Lấy danh sách user cập nhật
    let users = await Users.find({
      "taikhoancap": { $in: ["Cấp Phòng", "Cấp Xã"] },
      capcha: value.id_user
    }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });

    res.status(200).json({ status: "success", users, message: "Xóa tài khoản người dùng thành công" });

  } catch (error) {
    console.error("Lỗi deleteUserOfCapTinh:", error);
    res.status(500).json({ status: "failed", message: "Có lỗi xảy ra khi xóa người dùng" });
  }
},
  changeStatusAccountsOfCapTinh: async (req, res) => {
    let { data, id_user, block_by_admin } = req.body;
    try {
      for (let i of data) {
        let item = await Users.findById(i);
        // console.log(item)
        if (block_by_admin) {
          item.block_by_admin = !item.block_by_admin;
          await item.save();
        } else {
          item.status = !item.status;
          item.time_block = new Date()
          await item.save();
        }
      };
      const schema = Joi.object({
        id_user: Joi.string().required(),
      });

      const { error, value } = schema.validate({
        id_user: id_user,
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị id_user' });
      };
      let users = await Users.find({
        "taikhoancap": { $in: ["Cấp Phòng", "Cấp Xã"] },
        capcha: value.id_user
      }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });
      res.status(200).json({ users, message: "Thay đổi trạng thái hoạt động thành công!" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: error.message,
      });
    }
  },
  requestRefreshToken: async (req, res) => {
    // console.log(req.cookies)
    const refreshToken = req.cookies.refreshToken_chamdiemcaicach;
    // console.log(refreshToken)
    if (!refreshToken) {
      return res.status(401).json({ message: 'Token không tồn tại. Vui lòng đăng nhập' })
    };
    // console.log(refreshToken)
    // kiểm tra xem trong db có refreshtoken này không nếu k có thì là k hợp lệ
    const checkRefreshTokenInDb = await RefreshTokens.findOne({ refreshToken });
    // console.log('token',checkRefreshTokenInDb)
    // console.log(checkRefreshTokenInDb)
    if (!checkRefreshTokenInDb) return res.status(403).json({ message: "Token không hợp lệ" });

    jwt.verify(refreshToken,process.env.REFRESH_TOKEN, async (err, user) => {
      if (err) {
        console.log(err.message)
      };

      const newAccessToken = jwt.sign({ userId: user.userId }, process.env.ACCESS_TOKEN, {
        expiresIn: '30m'
      });

      const newRefreshToken = jwt.sign({ userId: user.userId },process.env.REFRESH_TOKEN, {
        expiresIn: '30d'
      });

      await RefreshTokens.findOneAndDelete({ refreshToken: refreshToken })
      // thêm refreshtoken mới vào db sau đó trả về client accesstoken mới
      let newItem = new RefreshTokens({
        refreshToken: newRefreshToken
      });
      await newItem.save()
      res.status(200).json({ accessToken: newAccessToken, refreshToken: newRefreshToken })
      console.log('ok')
    })
  },
  changePassword: async (req, res) => {
    let { id, matkhaucu, matkhaumoi } = req.body;
    try {
      const schema = Joi.object({
        id: Joi.string().required(),
        matkhaucu: Joi.string().required(),
      });

      const { error, value } = schema.validate({
        id: id, matkhaucu: matkhaucu
      });
      if (error) {
        return res.status(400).json({ status: false, message: 'Lỗi giá trị id' });
      };
      let user = await Users.findOne({ _id: value.id, matkhau: value.matkhaucu });
      if (!user) {
        console.log('sai mk')
        res.status(401).json({ message: "Mật khẩu cũ không chính xác. Vui lòng kiểm tra lại" })
        return;
      }

      user.matkhau = matkhaumoi;
      await user.save();
      // console.log(req.user_created)
      // await saveAction(req.userId.userId, `Thay đổi mật khẩu`)
      res.status(200).json({ message: "Đổi mật khấu thành công. Vui lòng đăng nhập lại." })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Lỗi server, Vui lòng liên hệ quản trị hệ thống" });
    }
  },
  fetchAccountLevelChaBeforeAdd: async (req, res) => {
    try {
      let items = await Users.find({
        level: "Cấp cha"
      }).populate('account_cha', { _id: 1, tenhienthi: 1 });

      res.status(200).json(items)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: error.message,
      });
    }
  },
  getUserCapTinh: async (req, res) => {
    try {
      let users = await Users.find({
        "taikhoancap": { $in: ["Cấp Tỉnh"] }
      }).populate('capcha', { _id: 1, tenhienthi: 1 }).sort({ thutu: 1 });

      res.status(200).json(users)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Có lỗi xảy ra khi lấy dữ liệu người dùng" });
    }
  },
  getNhomchucnang: async (req, res) => {
    let taikhoancap = req.query.taikhoancap;
    try {
      if (taikhoancap === "Cấp Bộ") {
        return res.status(200).json([
          "Các đơn vị thuộc cơ quan Bộ có chức năng giải quyết TTHC cho cá nhân, tổ chức",
          "Các đơn vị thuộc cơ quan Bộ không có chức năng giải quyết TTHC cho cá nhân, tổ chức",
          "Công an cấp tỉnh"
        ])
      } else if (taikhoancap === "Cấp Tỉnh") {
        return res.status(200).json([
          "Phòng có chức năng giải quyết thủ tục hành chính",
          "Phòng không có chức năng giải quyết thủ tục hành chính",
          "Cấp Xã"
        ])
      }
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Có lỗi xảy ra" });
    }
  },
  //lấy ra các tài khoản cấp con của 1 tài khoản
  fetchChildrenUser: async (req, res) => {
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
    let cuocChamDiem = await QuantriNamChamdiem.findOne({ user_created: value.id_user, nam: value.year });
    if (cuocChamDiem === null) {
      return res.status(401).json({ status: "failed", message: "Chưa có cuộc chấm điểm năm " + year });
    }
    try {
      let items = await Users.find({ capcha: value.id_user, _id: {$ne: value.id_user}, role: {$ne: true} }, { _id: 1, tenhienthi: 1, time_block: 1, status: 1 }).sort({ thutu: 1 });

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
//suawr 2026
  fetchListUserCon: async (req, res) => {
    try {
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

    let items = (await Users.find({capcha: id_user})).sort({thutu: 1}).lean();
    res.status(200).json(items)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({ status: "failed", message: "Có lỗi xảy ra  " + error.message });
    }
  },

  // hàm lấy danh sách ảnh chữ ký
  getSignatureImg: async (req, res) => {
    try {
        const user = await Users.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
        }

        // Trả về cấu trúc giống như Frontend đang mong đợi
        res.json({
            signatureUrl: user.signatureImg?.chuky ? `${req.protocol}://${req.get('host')}${user.signatureImg.chuky}` : '',
            stampUrl: user.signatureImg?.condau ? `${req.protocol}://${req.get('host')}${user.signatureImg.condau}` : ''
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
},
uploadSignatureImg: async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, isDeleted } = req.body; // 'signature' hoặc 'stamp'

    // Validate userId đúng định dạng ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId không hợp lệ' });
    }

    if (!['signature', 'stamp'].includes(type)) {
      return res.status(400).json({ message: 'Loại định dạng chữ ký (type) không hợp lệ!' });
    }

    // Tìm user trong DB
    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    }

    if (!user.signatureImg) {
      user.signatureImg = { chuky: '', condau: '' };
    }

    let updatedPath = '';

    // Thư mục lưu chữ ký / con dấu tuyệt đối (chỉ resolve 1 lần, dùng chung)
    const signatureDir = path.resolve(__dirname, '../signatures'); // Điều chỉnh lại đường dẫn thực tế nếu cần

    // Hàm bổ trợ xóa file an toàn - Khóa Path Manipulation
    const safeDeleteFile = (relativePath) => {
      if (!relativePath) return;

      // Chỉ lấy tên file an toàn, loại bỏ mọi ../ hoặc / trong input
      const safeFileName = path.basename(relativePath);
      if (!safeFileName) return;

      const absolutePath = path.resolve(signatureDir, safeFileName);

      // Rào chắn bảo vệ: dùng path.relative thay vì startsWith
      // (startsWith bị bypass bởi thư mục trùng tiền tố, ví dụ "../signatures-backup")
      const relative = path.relative(signatureDir, absolutePath);
      const isInsideSignatureDir =
        relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);

      if (isInsideSignatureDir && fs.existsSync(absolutePath)) {
        try {
          fs.unlinkSync(absolutePath);
        } catch (err) {
          console.error(`Lỗi khi xóa file cũ ${absolutePath}:`, err);
        }
      }
    };

    // TRƯỜNG HỢP 1: XÓA ẢNH CŨ
    if (isDeleted === 'true') {
      const oldPath = type === 'signature' ? user.signatureImg.chuky : user.signatureImg.condau;

      safeDeleteFile(oldPath);

      if (type === 'signature') user.signatureImg.chuky = '';
      else user.signatureImg.condau = '';

    }
    // TRƯỜNG HỢP 2: THAY THẾ HOẶC THÊM ẢNH MỚI
    else if (req.file) {
      // Chuẩn hóa tên file tải lên (phòng vệ thêm dù multer đã sinh tên)
      const safeUploadedFileName = path.basename(req.file.filename);
      const newRelativePath = `/signatures/${safeUploadedFileName}`;
      const oldPath = type === 'signature' ? user.signatureImg.chuky : user.signatureImg.condau;

      // Xóa file cũ
      safeDeleteFile(oldPath);

      if (type === 'signature') user.signatureImg.chuky = newRelativePath;
      else user.signatureImg.condau = newRelativePath;

      updatedPath = `${req.protocol}://${req.get('host')}${newRelativePath}`;
    } else {
      return res.status(400).json({ message: 'Không có file hoặc yêu cầu nào được gửi lên.' });
    }

    await user.save();

    return res.status(200).json({
      message: 'Cập nhật thành công!',
      url: updatedPath
    });

  } catch (error) {
    // Dọn dẹp file tạm an toàn nếu lưu DB thất bại
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Lỗi khi dọn dẹp file tạm:', e);
      }
    }
    console.error('Lỗi uploadSignatureImg:', error);
    return res.status(500).json({ error: error.message });
  }
},
};
