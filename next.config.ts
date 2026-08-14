import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App không dùng Server Actions (upload đi thẳng qua Supabase Storage,
  // xử lý qua API Routes) nên không cần serverActions.bodySizeLimit.
  // Giới hạn dung lượng file được kiểm tra ở client (trước khi upload)
  // và ở API /api/process (sau khi tải từ Storage).
};

export default nextConfig;
