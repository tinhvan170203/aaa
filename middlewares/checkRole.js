const Users = require("../models/Users");
const _ = require('lodash');

let checkRole = (role) => {
    return async (req, res, next) => {
        let userId = req.userId.userId;

        const user = await Users.findOne({ _id: userId });

        if (user === null) {
            res.status(403).json({ message: "Tài khoản không tồn tại, vui lòng đăng nhập lại" })
        } else {
            req.user = user;
            
            let checkedRole = user.role === "Quản trị hệ thống";
            
            if (!checkedRole) {
                res.status(401).json({ message: `Tài khoản không có quyền quản trị hệ thống, vui lòng đăng nhập tài khoản có chức năng này!` });
                return;
            };

            next();
        }
    }
}

module.exports = checkRole;