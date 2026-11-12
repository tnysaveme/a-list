import type { Metadata, Viewport } from 'next';
import './globals.css';
import localFont from 'next/font/local';
import { AppearanceSync } from '../components/appearance-sync';
import { appearanceScript } from '../lib/appearance';
import { PerformanceInsights } from '../components/performance-insights';

const figtree = localFont({
  src: './fonts/figtree-latin.woff2',
  weight: '300 900',
  variable: '--font-figtree',
  display: 'swap',
});
const inter = localFont({
  src: './fonts/inter-latin.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
});
const description =
  'Save films, follow their digital and streaming release dates, and keep them in your calendar.';
const appUrl =
  process.env.ALIST_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');
const previewImage = {
  url: '/link-preview.jpg',
  width: 1200,
  height: 675,
  alt: 'A face illuminated by blue and cyan light',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: 'A-List',
  description,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'A-List',
    title: 'A-List',
    description,
    images: [previewImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A-List',
    description,
    images: [previewImage],
  },
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/favicon.svg?v=2', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico?v=2',
    apple: { url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${figtree.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="antialiased">
        <AppearanceSync />
        {children}
        <PerformanceInsights />
      </body>
    </html>
  );
}
