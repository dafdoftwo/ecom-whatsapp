import type { Metadata } from "next";
import { Noto_Sans_Arabic } from "next/font/google";
import Navigation from "@/components/Navigation";
import "./globals.css";

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "نظام أتمتة الواتساب التجاري",
  description: "نظام تجاري متقدم لأتمتة رسائل الواتساب وإدارة الطلبات",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={notoSansArabic.variable}>
        {/* شريط التنقل المحسن */}
        <nav className="navbar">
          <div className="container">
            <div className="flex items-center justify-between">
              {/* الشعار */}
              <a href="/" className="navbar-brand">
                <span style={{ fontSize: '1.5rem' }}>🇪🇬</span>
                <span>نظام الواتساب المصري</span>
              </a>
              
              {/* روابط التنقل للديسكتوب */}
              <Navigation />

              {/* مؤشر الحالة للديسكتوب */}
              <div className="status-indicator status-online desktop-only">
                <span>●</span>
                نظام نشط
              </div>

              {/* قائمة الموبايل */}
              <Navigation isMobile />
            </div>
          </div>
        </nav>

        {/* المحتوى الرئيسي */}
        <main style={{ minHeight: 'calc(100vh - 80px)' }}>
        {children}
        </main>
      </body>
    </html>
  );
}
