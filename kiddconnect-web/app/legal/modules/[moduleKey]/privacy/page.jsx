'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useParams } from 'next/navigation';

// Module-specific privacy policy
// Each module can have its own privacy page at /legal/modules/[moduleKey]/privacy

export default function ModulePrivacyPage() {
  const params = useParams();
  const moduleKey = params?.moduleKey;
  
  // Module-specific privacy content
  const modulePrivacy = {
    reviews: {
      title: 'Review Reply AI - Privacy Policy',
      moduleName: 'Review Reply AI',
      version: '1.0.0',
      sections: [
        {
          title: '1. Data Collection',
          content: (
            <>
              <p>
                Review Reply AI collects and processes the following information:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Review Content:</strong> The text of reviews you submit for reply generation</li>
                <li><strong>Business Information:</strong> Your business name, industry, and branding preferences</li>
                <li><strong>Generated Replies:</strong> AI-generated reply suggestions created for your reviews</li>
                <li><strong>Usage Data:</strong> Number of replies generated, features used, and usage patterns</li>
              </ul>
            </>
          )
        },
        {
          title: '2. How We Use Your Data',
          content: (
            <>
              <p>
                Review Reply AI uses your data to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Generate personalized reply suggestions for your reviews</li>
                <li>Improve AI response quality and relevance</li>
                <li>Provide usage statistics and analytics</li>
                <li>Enhance service features and functionality</li>
              </ul>
            </>
          )
        },
        {
          title: '3. Data Storage',
          content: (
            <>
              <p>
                Review content and generated replies are stored securely and may be retained for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Service functionality (accessing reply history)</li>
                <li>Service improvement and AI training (anonymized where possible)</li>
                <li>Legal and compliance requirements</li>
              </ul>
            </>
          )
        },
        {
          title: '4. Data Sharing',
          content: (
            <>
              <p>
                Review Reply AI does not share your review content or generated replies with third parties 
                except:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>AI service providers necessary for reply generation (OpenAI)</li>
                <li>When required by law or legal process</li>
                <li>To protect our rights or prevent harm</li>
              </ul>
            </>
          )
        },
        {
          title: '5. Your Rights',
          content: (
            <>
              <p>
                You have the right to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Access your review data and generated replies</li>
                <li>Delete specific reviews or generated content</li>
                <li>Export your data</li>
                <li>Opt out of data usage for AI improvement (may affect service quality)</li>
              </ul>
            </>
          )
        },
        {
          title: '6. Data Security',
          content: (
            <p>
              All review content and generated replies are encrypted in transit and at rest. We implement 
              industry-standard security measures to protect your data.
            </p>
          )
        },
        {
          title: '7. Third-Party Services',
          content: (
            <p>
              Review Reply AI uses OpenAI's API for reply generation. Review content is sent to OpenAI 
              for processing in accordance with OpenAI's privacy policy and data processing terms.
            </p>
          )
        },
        {
          title: '8. Module-Specific Privacy',
          content: (
            <p>
              This privacy policy applies specifically to the Review Reply AI module. Your use of this 
              module is also governed by Tavari AI's general Privacy Policy.
            </p>
          )
        }
      ]
    },
    'delivery-dispatch': {
      title: 'Last-Mile Delivery - Privacy Policy',
      moduleName: 'Last-Mile Delivery',
      version: '1.0.0',
      sections: [
        {
          title: '1. Data Collection',
          content: (
            <>
              <p>
                Last-Mile Delivery collects and processes the following information:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Pickup and delivery addresses</strong> you provide when requesting a delivery</li>
                <li><strong>Contact information</strong> (e.g., phone number, recipient name) for coordination and communication</li>
                <li><strong>Package or shipment details</strong> (e.g., description, priority) that you submit</li>
                <li><strong>Saved addresses</strong> and location labels you store for convenience</li>
                <li><strong>Usage data</strong> such as delivery requests, status, and account activity</li>
              </ul>
            </>
          )
        },
        {
          title: '2. How We Use Your Data',
          content: (
            <>
              <p>
                We use your data to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Facilitate and coordinate pickup and delivery requests</li>
                <li>Share necessary information with third-party delivery providers so they can perform the delivery</li>
                <li>Display your delivery history and saved addresses within the platform</li>
                <li>Provide support, improve the service, and comply with legal obligations</li>
              </ul>
            </>
          )
        },
        {
          title: '3. Sharing with Third-Party Delivery Providers',
          content: (
            <>
              <p>
                <strong>Delivery is performed by independent third-party providers.</strong> To fulfill your delivery
                requests, we share with those providers the information necessary to perform the pickup and delivery,
                such as:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Pickup and delivery addresses</li>
                <li>Contact phone numbers and recipient names</li>
                <li>Package descriptions and priority</li>
              </ul>
              <p className="mt-4">
                Those third-party providers have their own privacy practices and may use your information in
                accordance with their policies and applicable law. We do not control their handling of your data
                once it has been shared for the purpose of performing the delivery. We are not responsible for
                the privacy practices of third-party delivery providers.
              </p>
            </>
          )
        },
        {
          title: '4. Data Storage and Retention',
          content: (
            <p>
              We store pickup and delivery data, saved addresses, and request history for as long as needed to
              provide the service, support your account, and meet legal and compliance requirements. You may delete
              saved addresses through the platform; historical delivery records may be retained for operational
              and legal purposes.
            </p>
          )
        },
        {
          title: '5. Your Rights',
          content: (
            <>
              <p>
                You have the right to access, correct, or delete the data you provide (e.g., saved addresses).
                You may also request information about how we process your data. Requests can be made through
                your account settings or by contacting us. Note that we must share certain data with third-party
                delivery providers to complete deliveries; we cannot control how they retain or use that data.
              </p>
            </>
          )
        },
        {
          title: '6. Data Security',
          content: (
            <p>
              We use reasonable technical and organizational measures to protect your data. Data is encrypted in
              transit and stored securely. Information shared with third-party delivery providers is subject to
              their own security practices.
            </p>
          )
        },
        {
          title: '7. Third-Party Providers and Liability',
          content: (
            <p>
              Last-Mile Delivery relies on third-party providers to perform actual deliveries. We are not
              responsible for their privacy practices, data handling, or any harm arising from their use of
              your information. Your use of the delivery service is subject to our Terms of Service for this
              module, which allocate responsibility to the third-party delivery provider for the delivery
              service itself.
            </p>
          )
        },
        {
          title: '8. Module-Specific Privacy',
          content: (
            <p>
              This privacy policy applies specifically to the Last-Mile Delivery module. Your use of this module
              is also governed by Tavari AI's general Privacy Policy.
            </p>
          )
        }
      ]
    }
  };
  
  if (!moduleKey || !modulePrivacy[moduleKey]) {
    notFound();
  }
  
  const privacy = modulePrivacy[moduleKey];
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">{privacy.title}</h1>
        
        <div className="mb-6 text-sm text-gray-600 bg-white p-4 rounded-lg shadow">
          <p><strong>Module:</strong> {privacy.moduleName}</p>
          <p><strong>Version:</strong> {privacy.version}</p>
          <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-8 space-y-8 text-gray-700">
          {privacy.sections.map((section, index) => (
            <section key={index}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">{section.title}</h2>
              <div className="space-y-2">
                {section.content}
              </div>
            </section>
          ))}
        </div>
        
        <div className="mt-12 pt-8 border-t border-gray-200 bg-white p-6 rounded-lg shadow">
          <p className="text-sm text-gray-600 mb-4">
            This privacy policy applies specifically to the {privacy.moduleName} module. For general 
            privacy information, see Tavari AI's <Link href="/legal/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
          </p>
          <Link 
            href={`/legal/modules/${moduleKey}/terms`}
            className="text-sm text-blue-600 hover:underline"
          >
            Module Terms of Service →
          </Link>
        </div>
      </div>
    </div>
  );
}

