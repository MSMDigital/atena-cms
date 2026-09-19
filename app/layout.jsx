import './admin.css';

export const metadata = { title: 'Outsmart CMS', robots: { index: false, follow: false } };

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
