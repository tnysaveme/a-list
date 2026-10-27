import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Figtree, Inter } from 'next/font/google';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#161719' },
  ],
};

export const metadata: Metadata = {
  title: 'A-List — your next movie night',
  description:
    'Your personal film library. Follow US digital and streaming release dates, then bring them to Apple Calendar.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${figtree.variable} ${inter.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
