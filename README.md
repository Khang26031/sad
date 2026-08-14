# SHOPBANHANG - Web Bán Tài Khoản & Key Tự Động (HTML/JS + Supabase + MBBank)

Website bán tài khoản, key game/software tự động sử dụng giao diện tĩnh cực nhẹ (HTML, Vanilla CSS, JS) kết nối trực tiếp với **Supabase** và chạy kiểm tra thanh toán qua **MBBank Auto Check** trên Vercel Serverless Functions.

## Hướng Dẫn Kết Nối Supabase & Chạy SQL
1. Đăng nhập vào [Supabase Dashboard](https://supabase.com/).
2. Chọn dự án của bạn và mở **SQL Editor**.
3. Tạo query mới, sao chép toàn bộ nội dung trong file [database.sql](file:///C:/Users/KHANG/SHOPBANHANG/database.sql) và chạy (**Run**).
   - *Lưu ý*: Tài khoản đăng ký đầu tiên trên web sẽ tự động trở thành **Admin** (được cấu hình trong Trigger của DB).

## Cấu Hình Môi Trường Trên Vercel
Khi deploy lên Vercel, hãy cấu hình các biến môi trường (Environment Variables) trong tab **Settings -> Environment Variables**:

| Tên Biến | Mô Tả | Ví Dụ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL kết nối Supabase của bạn | `https://agewogarchceqcoxdxgi.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Khóa Service Role bảo mật cao (Backend) | `eyJhbGciOiJIUzI1NiIsIn...` |
| `MB_USERNAME` | Tên đăng nhập app MBBank (Nếu không điền, sẽ lấy từ DB Settings) | `usermbbank123` |
| `MB_PASSWORD` | Mật khẩu app MBBank (Nếu không điền, sẽ lấy từ DB Settings) | `passmbbank456` |
| `MB_ACCOUNT` | Số tài khoản MBBank nhận tiền (Nếu không điền, sẽ lấy từ DB Settings) | `123456789` |

*Lưu ý*: Đảm bảo bạn đã điền các khóa này đầy đủ trên Vercel để hệ thống tự động kiểm tra thanh toán.

## Chạy Thử Tại Local
1. Điền thông tin kết nối Supabase vào file `config.js`.
2. Mở file `index.html` trực tiếp hoặc chạy một web server tĩnh tại local.
