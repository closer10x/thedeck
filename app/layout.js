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
  // the browser chrome follows the theme rather than staying pale in the dark
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F4F8' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0D12' },
  ],
};

// Runs before the first paint. A saved choice has to be on the html element
// before anything renders, or the app comes up light and snaps to dark a beat
// later — worse at night than having no dark mode at all.
const APPLY_THEME = `try{var t=localStorage.getItem('rolodeck_theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
      </head>
      <body style={{ fontFamily: 'var(--body), system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}
