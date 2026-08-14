# BOM FILTER XƯỞNG V3.1

Next.js + React + Vercel + Supabase.

## V3.1
- Supabase Auth: đăng ký/đăng nhập/đăng xuất.
- Mỗi tài khoản chỉ thấy dữ liệu của mình (RLS).
- File BOM lưu Supabase Storage.
- Kết quả xử lý lưu PostgreSQL.
- Vercel-ready, Node.js runtime cho API xử lý Excel.

## Deploy
1. Push toàn bộ repo lên GitHub.
2. Supabase SQL Editor: chạy `supabase/schema.sql`.
3. Vercel: Import repo.
4. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=bom-files`.
5. Deploy.
6. Supabase Auth > URL Configuration: đặt Site URL là domain Vercel và thêm Redirect URL nếu dùng domain riêng.

Không đưa `SUPABASE_SERVICE_ROLE_KEY` vào client hoặc GitHub.
