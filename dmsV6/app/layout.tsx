import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '文件管理系統 - DMS',
  description: 'DMS 文件管理系統'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
