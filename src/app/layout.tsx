import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { BrandVars, ThemeProvider, themeScript } from '@/lib/theme';
import { ToastProvider } from '@/lib/toast';

export const metadata: Metadata = {
  title: 'ZLAQA Team OS',
  description: 'Attendance, OKRs, tasks, calendar and team communication for ZLAQA AI',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/logo-black.png',
  },
  appleWebApp: { capable: true, title: 'ZLAQA OS', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <BrandVars />
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
