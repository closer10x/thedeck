import './globals.css';
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--display' });
const body = Inter({ subsets: ['latin'], variable: '--body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--mono' });

export const metadata = {
  title: 'The Deck',
  description: 'Who you owe an invite.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#F5F4F8',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body style={{ fontFamily: 'var(--body), system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}
