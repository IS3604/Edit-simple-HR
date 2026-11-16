import type { Metadata, Viewport } from 'next';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import { Toaster } from '@/components/ui/Toaster';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'EditSimple HR', template: '%s · EditSimple HR' },
  description: 'Internal HR portal for EditSimple',
  robots: { index: false, follow: false },
  applicationName: 'EditSimple HR',
  appleWebApp: { capable: true, title: 'EditSimple HR', statusBarStyle: 'default' },
};

// Run server code in Mumbai, next to the Supabase database (ap-south-1).
export const preferredRegion = 'bom1';

export const viewport: Viewport = { themeColor: '#FFFFFF', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
