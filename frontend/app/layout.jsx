import './globals.css';
import { ToastProvider } from '@/components/ToastProvider';
import Script from 'next/script';

export const metadata = {
  title: 'Tavari Ai',
  description: 'Tavari Ai — AI communications, phone agents, and business tools',
};

export default function RootLayout({ children }) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  // Generate Google Analytics script content
  const gaScriptContent = gaMeasurementId ? `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaMeasurementId}');
  ` : '';

  return (
    <html lang="en">
      <body>
        {/* Google Analytics - only load if measurement ID is provided */}
        {gaMeasurementId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {gaScriptContent}
            </Script>
          </>
        )}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

