import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BOM FILTER V3",
  description: "Lọc BOM tự động theo xưởng",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
