import './globals.css';
import { ToastProvider } from '@/components/ToastProvider';
import Script from 'next/script';

export const metadata = {
  title: 'Tavari AI Phone Agent',
  description: 'Self-serve AI phone answering service',
};

export default function RootLayout({ children }) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}');
              `}
            </Script>
          </>
        )}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

