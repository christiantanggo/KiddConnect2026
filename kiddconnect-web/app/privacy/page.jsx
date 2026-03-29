import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy - Tavari',
  description: 'Tavari Privacy Policy - How we collect, use, and protect your information',
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-4">
              <strong>Last Updated:</strong> December 22, 2025
            </p>
            
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-600 mb-4">
                Tavari ("we," "our," or "us") operates the Tavari AI Phone Agent platform (the "Service"). 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
              </p>
              <p className="text-gray-600">
                By using our Service, you agree to the collection and use of information in accordance with this policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>
              
              <h3 className="text-xl font-semibold text-gray-800 mb-3">2.1 Information You Provide</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li><strong>Account Information:</strong> Name, email address, phone number, business name, and billing information</li>
                <li><strong>Business Information:</strong> Business details, hours, FAQs, and contact information</li>
                <li><strong>Call and Message Data:</strong> Recordings, transcripts, and metadata from calls and messages</li>
                <li><strong>Contact Lists:</strong> Customer phone numbers, names, and email addresses uploaded for SMS campaigns</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">2.2 Automatically Collected Information</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Usage data and analytics</li>
                <li>Device information and IP addresses</li>
                <li>Cookies and similar tracking technologies</li>
                <li>Call logs and performance metrics</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>To provide and maintain our Service</li>
                <li>To process calls and messages through our AI phone agent</li>
                <li>To send SMS campaigns on behalf of your business</li>
                <li>To manage your account and process payments</li>
                <li>To communicate with you about your account and our services</li>
                <li>To improve and optimize our Service</li>
                <li>To comply with legal obligations</li>
                <li>To detect and prevent fraud or abuse</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. SMS and Messaging</h2>
              <p className="text-gray-600 mb-4">
                When you use our SMS campaign features:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>We store contact information (phone numbers, names, emails) that you upload</li>
                <li>We track opt-in/opt-out status for TCPA compliance</li>
                <li>We send messages on your behalf using your business phone number</li>
                <li>All messages include required compliance text (STOP/START instructions)</li>
                <li>We process opt-out requests automatically when customers text "STOP"</li>
              </ul>
              <p className="text-gray-600">
                <strong>Customer Opt-Out:</strong> Customers can opt-out of SMS messages at any time by texting "STOP" 
                to your business phone number. We automatically process these requests and update your contact lists.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Information Sharing and Disclosure</h2>
              <p className="text-gray-600 mb-4">
                We do not sell your personal information. We may share your information only in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li><strong>Service Providers:</strong> With third-party service providers who assist in operating our Service (e.g., phone service providers, payment processors)</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>With Your Consent:</strong> When you explicitly authorize us to share information</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Security</h2>
              <p className="text-gray-600 mb-4">
                We implement appropriate technical and organizational measures to protect your information, including:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Encryption of data in transit and at rest</li>
                <li>Secure authentication and access controls</li>
                <li>Regular security assessments and updates</li>
                <li>Limited access to personal information on a need-to-know basis</li>
              </ul>
              <p className="text-gray-600 mt-4">
                However, no method of transmission over the Internet or electronic storage is 100% secure. 
                While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Data Retention</h2>
              <p className="text-gray-600 mb-4">
                We retain your information for as long as necessary to provide our Service and comply with legal obligations:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Account information is retained while your account is active</li>
                <li>Call recordings and transcripts are retained according to your plan settings</li>
                <li>Contact lists and SMS campaign data are retained until you delete them</li>
                <li>Opt-out records are retained to ensure compliance with TCPA regulations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Your Rights</h2>
              <p className="text-gray-600 mb-4">
                Depending on your location, you may have the following rights regarding your personal information:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li><strong>Access:</strong> Request access to your personal information</li>
                <li><strong>Correction:</strong> Request correction of inaccurate information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Portability:</strong> Request transfer of your data</li>
                <li><strong>Opt-Out:</strong> Opt-out of marketing communications</li>
              </ul>
              <p className="text-gray-600 mt-4">
                To exercise these rights, contact us at{' '}
                <a href="mailto:info@tanggo.ca" className="text-blue-600 hover:underline">
                  info@tanggo.ca
                </a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Children's Privacy</h2>
              <p className="text-gray-600">
                Our Service is not intended for children under 13 years of age. We do not knowingly collect personal 
                information from children under 13. If you believe we have collected information from a child under 13, 
                please contact us immediately.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Changes to This Privacy Policy</h2>
              <p className="text-gray-600">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the 
                new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this 
                Privacy Policy periodically for any changes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Contact Us</h2>
              <p className="text-gray-600 mb-2">
                If you have questions about this Privacy Policy, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-700">
                  <strong>Email:</strong>{' '}
                  <a href="mailto:info@tanggo.ca" className="text-blue-600 hover:underline">
                    info@tanggo.ca
                  </a>
                </p>
              </div>
            </section>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="space-x-4">
                <Link href="/terms" className="text-blue-600 hover:underline text-sm">
                  Terms of Service
                </Link>
                <Link href="/opt-in-workflow" className="text-blue-600 hover:underline text-sm">
                  SMS Opt-In Workflow
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

