import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FamilyHub',
  description: 'ניהול משימות משפחתי',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-gray-50 text-gray-900 font-sans">{children}</body>
    </html>
  )
}
