# Dự án Zalo ChatBot

Dự án Zalo ChatBot này được phát triển bằng JavaScript với thư viện **zlbotdqt**. Người tạo ra dự án này là **NDQ x LQT**. Bạn có thể tìm thêm thông tin tại [NDQ x LQT](https://github.com/Ndqitisme).

Bắt đầu từ phiên bản 1.5.0 trở lên được viết bởi Hà Huy Hoàng

## Tính năng của phiên bản (v1.5.4)

Các tính năng sau có trong phiên bản này:

- **Auto Manager Group Zalo**: Với hơn 50 lệnh quản lý:
- Tự động chống spam/chống liên kết/chống badword/chống phát hiện...
- **Social Bot**: Với hơn 50 lệnh để gửi nội dung giải trí từ youtube, tiktok, zingmp3, nhaccuatui,.... và nhiều hơn nữa.
- Tổng cộng khi **Hoàng** viết tiếp code này nó đã đạt tới 135 lệnh

## Hướng dẫn sử dụng

1. **Cấu hình**: Cấu hình bot trong tệp `config.json` nằm trong thư mục `assets`. Sau đây là những gì bạn cần thiết lập:
- **Cookie**: Sử dụng tiện ích mở rộng **J2TEAM Cookies** để lấy cookie của bạn. Bạn có thể tìm tiện ích mở rộng [tại đây](https://chrome.google.com/webstore/detail/j2team-cookies/okpidcojinmlaakglcigllbpcpajaibco).
- **IMEI**: Truy cập Zalo Web, sau đó mở Công cụ dành cho nhà phát triển (DevTools), chuyển sang tab Console và nhập lệnh sau:
```javascript
localStorage.getItem('z_uuid');
```
- **UserAgent**: Bạn có thể để nguyên UserAgent mặc định hoặc thay thế bằng UserAgent của riêng bạn. Truy cập [whatmyuseragent.com](https://whatmyuseragent.com/) để kiểm tra UserAgent của bạn.

2. **Chạy Bot**: Sau khi định cấu hình các cài đặt cần thiết, hãy chạy tệp `run.bat` để khởi động bot.

3. **Thiết lập Quyền quản trị**: Bạn có thể xem UID của tài khoản mà bạn muốn cấp quyền quản trị thông qua bảng điều khiển. Thêm UID vào tệp `list_admin.json` trong thư mục `assets/data`.

4. **Khởi động lại Công cụ**: Đảm bảo khởi động lại công cụ sau khi cấu hình để đảm bảo mọi thứ hoạt động chính xác.
5. Nhớ sửa buffer lại thành **buffder/index.js** trong file modules khi đã tải npm i nhé

Cảm ơn bạn đã sử dụng mã nguồn của chúng tôi. Chúng tôi hy vọng bạn thích các tính năng mà nó cung cấp!