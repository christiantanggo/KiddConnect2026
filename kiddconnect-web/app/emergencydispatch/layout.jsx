export const metadata = {
  title: 'Emergency Plumber London Ontario | 24/7 Plumbing Dispatch',
  description: 'Need an emergency plumber in London Ontario? Our 24/7 dispatch service connects you with available local plumbers immediately. Call now for fast help.',
};

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Tavari Emergency Dispatch',
  areaServed: 'London Ontario',
  telephone: '+15199009119',
  description: '24/7 emergency plumbing dispatch service connecting customers with local plumbers in London Ontario.',
};

export default function EmergencyDispatchLayout({ children }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      {children}
    </>
  );
}
