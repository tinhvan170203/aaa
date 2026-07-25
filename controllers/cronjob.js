const Phieuchamdiems = require("../models/Phieuchamdiem");
const QuantriNamChamdiem = require("../models/QuanlyNamChamdiem");

const convert_hour_to_milisecond = () => {
    return 60 * 60 * 1000
};


const cronjob_create_report = async () => {
    //kiểm tra xem có cuộc chấm điểm nào đến hạn khóa tự chấm và khóa hết hạn giải trình không
    let check_nam_cham_diem_phai_khoa_tu_cham = await QuantriNamChamdiem.find({
        ketthuctuchamdiem: false
    });
    let check_nam_cham_diem_phai_khoa_giai_trinh = await QuantriNamChamdiem.find({
        ketthucthoigiangiaitrinh: false
    });

    let time_now = (new Date()).getTime()
    for (let item of check_nam_cham_diem_phai_khoa_tu_cham) {
        let time_het_han_tu_cham = (new Date(item.thoigianhethantuchamdiem)).getTime();
        let list_id_phieucham_used = item.setting.map(e => e.phieucham);

        if (time_now > time_het_han_tu_cham) {
            let phieuchams_can_khoa_tu_cham = await Phieuchamdiems.find({
                phieuchamdiem: { $in: list_id_phieucham_used },
                'chotdiemtucham.status': false,
                year: item.nam
            });

            await QuantriNamChamdiem.updateMany({
                _id: item._id
            }, {
                ketthuctuchamdiem: true
            });

            for (let i of phieuchams_can_khoa_tu_cham) {
                let phieucham = await Phieuchamdiems.findById(i._id);
                phieucham.chotdiemtucham.status = true;
                phieucham.chotdiemtucham.time = phieucham.chotdiemtucham.time !== null ? phieucham.chotdiemtucham.time : (new Date());
                await phieucham.save()
            }
        }

    };

    for (let item of check_nam_cham_diem_phai_khoa_giai_trinh) {
        let time_het_han_giai_trinh = (new Date(item.thoigianhethangiaitrinh)).getTime();
        let list_id_phieucham_used = item.setting.map(e => e.phieucham);

        if (time_now > time_het_han_giai_trinh) {
            let phieuchams_can_khoa_giai_trinh = await Phieuchamdiems.find({
                phieuchamdiem: { $in: list_id_phieucham_used },
                'chotdiemgiaitrinh.status': false,
                year: item.nam
            });

            for (let i of phieuchams_can_khoa_giai_trinh) {
                let phieucham = await Phieuchamdiems.findById(i._id);
                phieucham.chotdiemgiaitrinh.status = true;
                phieucham.chotdiemgiaitrinh.time = phieucham.chotdiemgiaitrinh.time !== null ? phieucham.chotdiemgiaitrinh.time : (new Date());
                await phieucham.save()
            };

            await QuantriNamChamdiem.updateMany({
                _id: item._id
            }, {
                ketthucthoigiangiaitrinh: true
            });
        }

    };


// console.log('khởi chạy')

}


cronjob_create_report() // khởi chạy hàm này ngay khi start server
let cronjob_file = setInterval(cronjob_create_report, convert_hour_to_milisecond())
// convert_hour_to_milisecond()  hàm chuyển đổi số giờ cronjob để tạo báo cáo.
module.exports = { cronjob_file };