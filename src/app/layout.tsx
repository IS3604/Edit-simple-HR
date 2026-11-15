import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from '@/components/ui/Toaster';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'EditSimple HR', template: '%s · EditSimple HR' },
  description: 'Internal HR portal for EditSimple',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#F7F6F4' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
