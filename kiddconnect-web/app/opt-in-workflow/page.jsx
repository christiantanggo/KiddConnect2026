import Link from 'next/link';

export const metadata = {
  title: 'SMS Opt-In Workflow - Tavari',
  description: 'How customers opt-in to receive SMS messages from Tavari businesses',
};

export default function OptInWorkflow() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">SMS Opt-In Workflow</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-8">
              Tavari businesses can collect customer opt-ins through multiple methods. All opt-ins are documented and comply with TCPA regulations.
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Opt-In Methods</h2>
              
              <div className="space-y-6">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">1. Website Forms</h3>
                  <p className="text-gray-600 mb-2">
                    Businesses can add SMS opt-in checkboxes to their website forms (contact forms, checkout pages, newsletter signups, etc.).
                  </p>
                  <div className="bg-gray-50 p-4 rounded mt-2">
                    <p className="text-sm text-gray-700 font-mono">
                      ☐ I agree to receive marketing text messages from [Business Name] at the number provided. 
                      Message and data rates may apply. Reply STOP to unsubscribe.
                    </p>
                  </div>
                </div>

                <div className="border-l-4 border-green-500 pl-4">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">2. In-Person Sign-Up</h3>
                  <p className="text-gray-600 mb-2">
                    Customers can opt-in at physical business locations through:
                  </p>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                    <li>Paper sign-up forms with explicit consent language</li>
                    <li>Digital tablets or kiosks at checkout</li>
                    <li>Point-of-sale systems with opt-in prompts</li>
                  </ul>
                </div>

                <div className="border-l-4 border-purple-500 pl-4">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">3. Text-to-Join Keywords</h3>
                  <p className="text-gray-600 mb-2">
                    Customers can opt-in by texting a keyword to the business phone number:
                  </p>
                  <div className="bg-gray-50 p-4 rounded mt-2">
                    <p className="text-sm text-gray-700">
                      <strong>Keywords:</strong> JOIN, START, YES, SUBSCRIBE
                    </p>
                    <p className="text-sm text-gray-700 mt-2">
                      <strong>Example:</strong> Customer texts "JOIN" to +1-833-878-1633
                    </p>
                    <p className="text-sm text-gray-700 mt-2">
                      <strong>Response:</strong> "You've been subscribed to receive messages from [Business Name]. 
                      Reply STOP to unsubscribe. MSG & Data Rates Apply."
                    </p>
                  </div>
                </div>

                <div className="border-l-4 border-orange-500 pl-4">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">4. Online Forms</h3>
                  <p className="text-gray-600 mb-2">
                    Businesses can create custom opt-in forms through the Tavari dashboard with clear consent language and terms.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Opt-In Requirements</h2>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Clear disclosure that customer will receive marketing messages</li>
                <li>Business name must be clearly identified</li>
                <li>Customer must provide explicit consent (checked box, signed form, or keyword text)</li>
                <li>Opt-in must be documented with timestamp and method</li>
                <li>Message frequency disclosure (if applicable)</li>
                <li>Clear opt-out instructions (STOP keyword)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Opt-Out Process</h2>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-700 mb-2">
                  <strong>STOP Keyword:</strong> Customers can opt-out at any time by texting "STOP" to the business phone number.
                </p>
                <p className="text-gray-700 mb-2">
                  <strong>Confirmation:</strong> System automatically sends confirmation: "You have been unsubscribed. 
                  You will no longer receive messages from [Business Name]."
                </p>
                <p className="text-gray-700">
                  <strong>Re-subscribe:</strong> Customers can opt back in by texting "START" or "JOIN".
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Compliance & Documentation</h2>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>All opt-ins are timestamped and stored in the Tavari system</li>
                <li>Opt-in method is documented (website, in-person, keyword, etc.)</li>
                <li>Businesses can view opt-in history for each contact</li>
                <li>Automatic opt-out processing when customers text "STOP"</li>
                <li>TCPA compliant - all messages include required disclosures</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Message Content</h2>
              <p className="text-gray-600 mb-4">
                All SMS messages sent through Tavari include:
              </p>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-700 font-mono">
                  [Message Content]
                  <br /><br />
                  MSG & Data Rates Apply
                  <br />
                  STOP=stop, START=start
                </p>
              </div>
            </section>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                For questions about SMS opt-in, contact support at{' '}
                <a href="mailto:info@tanggo.ca" className="text-blue-600 hover:underline">
                  info@tanggo.ca
                </a>
              </p>
              <div className="mt-4 space-x-4">
                <Link href="/privacy" className="text-blue-600 hover:underline text-sm">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="text-blue-600 hover:underline text-sm">
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

