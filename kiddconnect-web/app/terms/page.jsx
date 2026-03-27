import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service - Tavari',
  description: 'Tavari Terms of Service - Terms and conditions for using our platform',
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-4">
              <strong>Last Updated:</strong> December 27, 2025
            </p>
            <p className="text-gray-600 mb-4">
              <strong>Terms Version:</strong> 2025-12-27
            </p>
            
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-600 mb-4">
                By accessing and using Tavari ("we," "our," or "us"), you accept and agree to be bound by the terms 
                and provision of this agreement. If you do not agree to these Terms of Service, please do not use our Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-600 mb-4">
                Tavari provides an AI-powered phone answering service and SMS campaign platform that enables businesses to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Answer phone calls automatically using AI assistants</li>
                <li>Send and receive SMS/MMS messages</li>
                <li>Manage customer contacts and lists</li>
                <li>Create and send SMS campaigns</li>
                <li>Track call and message analytics</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Account Registration</h2>
              <p className="text-gray-600 mb-4">
                To use our Service, you must:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Provide accurate, current, and complete information during registration</li>
                <li>Maintain and update your account information to keep it accurate</li>
                <li>Maintain the security of your account credentials</li>
                <li>Accept responsibility for all activities under your account</li>
                <li>Be at least 18 years old or have parental consent</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. SMS and Messaging Compliance</h2>
              
              <h3 className="text-xl font-semibold text-gray-800 mb-3">4.1 TCPA Compliance</h3>
              <p className="text-gray-600 mb-4">
                When using our SMS campaign features, you agree to comply with the Telephone Consumer Protection Act (TCPA) 
                and all applicable regulations:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>You must obtain explicit written consent before sending marketing SMS messages</li>
                <li>You must clearly identify your business in all messages</li>
                <li>You must provide clear opt-out instructions (STOP keyword)</li>
                <li>You must honor opt-out requests immediately</li>
                <li>You must not send messages to numbers on the National Do Not Call Registry (unless you have prior express written consent)</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">4.2 Opt-In Requirements</h3>
              <p className="text-gray-600 mb-4">
                You agree to only send SMS messages to contacts who have:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Explicitly opted-in to receive messages from your business</li>
                <li>Provided clear consent through a documented method (website form, in-person sign-up, keyword text, etc.)</li>
                <li>Been informed that message and data rates may apply</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">4.3 Prohibited Content</h3>
              <p className="text-gray-600 mb-4">
                You agree not to send messages containing:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Spam, phishing, or fraudulent content</li>
                <li>Illegal or harmful content</li>
                <li>Content that violates third-party rights</li>
                <li>Unsolicited messages to contacts who have not opted in</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Acceptable Use</h2>
              <p className="text-gray-600 mb-4">
                You agree not to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Use the Service for any illegal purpose or in violation of any laws</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
                <li>Use automated systems to access the Service without permission</li>
                <li>Transmit viruses, malware, or other harmful code</li>
                <li>Impersonate any person or entity</li>
                <li>Violate any third-party rights (intellectual property, privacy, etc.)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Payment and Billing</h2>
              <p className="text-gray-600 mb-4">
                <strong>Subscription Plans:</strong> Our Service is offered on a subscription basis. You agree to pay all 
                fees associated with your selected plan.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Fees are billed in advance on a monthly or annual basis</li>
                <li>All fees are non-refundable except as required by law</li>
                <li>We reserve the right to change our pricing with 30 days' notice</li>
                <li>Failure to pay may result in suspension or termination of your account</li>
              </ul>
              <p className="text-gray-600">
                <strong>Usage-Based Charges:</strong> Additional charges may apply for usage exceeding your plan limits 
                (e.g., additional call minutes, SMS messages, or storage).
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Intellectual Property</h2>
              <p className="text-gray-600 mb-4">
                The Service and its original content, features, and functionality are owned by Tavari and are protected by 
                international copyright, trademark, patent, trade secret, and other intellectual property laws.
              </p>
              <p className="text-gray-600">
                You retain ownership of your content (call recordings, messages, contact lists, etc.). By using the Service, 
                you grant us a license to use, store, and process your content solely for the purpose of providing the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Data and Privacy</h2>
              <p className="text-gray-600 mb-4">
                Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy to understand 
                how we collect, use, and protect your information.
              </p>
              <p className="text-gray-600">
                You are responsible for ensuring that any data you upload or process through the Service complies with applicable 
                privacy laws and that you have obtained necessary consents from data subjects.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Service Availability</h2>
              <p className="text-gray-600 mb-4">
                We strive to provide reliable service but do not guarantee:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Uninterrupted or error-free operation</li>
                <li>That the Service will meet your specific requirements</li>
                <li>That defects will be corrected</li>
              </ul>
              <p className="text-gray-600 mt-4">
                We reserve the right to modify, suspend, or discontinue the Service at any time with or without notice.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Artificial Intelligence (AI) Disclaimer and Limitations</h2>
              
              <h3 className="text-xl font-semibold text-gray-800 mb-3">10.1 AI Service Nature</h3>
              <p className="text-gray-600 mb-4">
                Tavari utilizes artificial intelligence and machine learning technologies to provide automated phone answering, 
                call handling, message taking, and transcription services. You acknowledge and understand that:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>AI systems are inherently unpredictable and may generate responses, summaries, or transcriptions that contain errors, inaccuracies, or omissions</li>
                <li>AI responses are generated based on algorithms and training data, and may not always accurately reflect caller intent, context, or meaning</li>
                <li>The quality and accuracy of AI-generated content depends on various factors including but not limited to audio quality, background noise, language complexity, and caller speech patterns</li>
                <li>AI systems may misinterpret information, misidentify callers, incorrectly transcribe speech, or provide responses that do not match your business's actual information or policies</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">10.2 No Warranty for AI Accuracy</h3>
              <p className="text-gray-600 mb-4">
                <strong>TAVARI MAKES NO WARRANTIES, EXPRESS OR IMPLIED, REGARDING THE ACCURACY, RELIABILITY, COMPLETENESS, OR SUITABILITY 
                OF AI-GENERATED CONTENT, INCLUDING BUT NOT LIMITED TO:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Call transcriptions and summaries</li>
                <li>Message content and caller information</li>
                <li>FAQ responses and business information delivery</li>
                <li>Intent detection and call routing decisions</li>
                <li>Any other AI-generated or AI-processed content</li>
              </ul>
              <p className="text-gray-600 mb-4">
                <strong>THE AI SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND. TAVARI DISCLAIMS ALL WARRANTIES, 
                WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, 
                FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, SPECIFICALLY AS IT RELATES TO AI FUNCTIONALITY AND ACCURACY.</strong>
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">10.3 User Responsibility for Input Quality</h3>
              <p className="text-gray-600 mb-4">
                You acknowledge and agree that:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>You are solely responsible for the accuracy, completeness, and quality of all information you provide to Tavari, including but not limited to:
                  <ul className="list-circle list-inside ml-6 mt-2 space-y-1">
                    <li>Business information (name, address, contact details, business hours, holiday hours)</li>
                    <li>Frequently Asked Questions (FAQs) and responses</li>
                    <li>Product or service descriptions</li>
                    <li>Any other configuration data, instructions, or content</li>
                  </ul>
                </li>
                <li>The quality and accuracy of AI responses directly depends on the quality and accuracy of the information you provide</li>
                <li>You must regularly review and update your business information, FAQs, and settings to ensure accuracy</li>
                <li>Tavari is not responsible for errors in AI responses that result from inaccurate, incomplete, or outdated information provided by you</li>
                <li>You are responsible for verifying and correcting any AI-generated content before relying on it for business decisions</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">10.4 Limitation of Liability for AI Errors</h3>
              <p className="text-gray-600 mb-4">
                <strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW, TAVARI SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, 
                CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM OR RELATED TO:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>AI-generated errors, inaccuracies, or omissions in call transcriptions, summaries, or messages</li>
                <li>Incorrect AI responses to caller questions or inquiries</li>
                <li>Misinterpretation of caller intent or information by AI systems</li>
                <li>Lost or missed calls due to AI system failures or errors</li>
                <li>Business losses, lost sales, or missed opportunities resulting from AI errors or inaccuracies</li>
                <li>Any reliance on AI-generated content without independent verification</li>
                <li>Consequences of AI responses that do not accurately reflect your business's actual policies, hours, or information</li>
              </ul>
              <p className="text-gray-600 mb-4">
                <strong>TAVARI'S TOTAL LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATED TO AI FUNCTIONALITY, ERRORS, OR INACCURACIES SHALL 
                NOT EXCEED THE AMOUNT PAID BY YOU TO TAVARI IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED DOLLARS ($100), 
                WHICHEVER IS GREATER.</strong>
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">10.5 User Responsibility for Review and Verification</h3>
              <p className="text-gray-600 mb-4">
                You acknowledge and agree that:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>You must review all AI-generated call summaries, transcriptions, and messages for accuracy before taking action</li>
                <li>You should verify caller information, contact details, and message content independently before responding to customers</li>
                <li>Tavari is not responsible for any actions you take based solely on AI-generated content without independent verification</li>
                <li>You are responsible for monitoring AI performance and reporting significant issues to Tavari support</li>
                <li>You should not rely exclusively on AI-generated content for critical business decisions without human verification</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">10.6 No Guarantee of Service Availability or Performance</h3>
              <p className="text-gray-600 mb-4">
                Tavari does not guarantee that:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>AI systems will be available 100% of the time without interruption</li>
                <li>All calls will be answered, transcribed, or processed correctly</li>
                <li>AI responses will meet your specific requirements or expectations</li>
                <li>AI-generated content will be error-free or suitable for your business needs</li>
                <li>Third-party AI service providers (OpenAI, VAPI, etc.) will maintain continuous availability</li>
              </ul>
              <p className="text-gray-600 mb-4">
                You acknowledge that AI services may be subject to temporary outages, performance degradation, or errors due to factors 
                beyond Tavari's control, including but not limited to third-party service provider issues, network problems, or technical failures.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">10.7 Third-Party AI Services and Service Providers</h3>
              <p className="text-gray-600 mb-4">
                <strong>Tavari acts as an intermediary platform</strong> that integrates and utilizes third-party AI and technology service 
                providers to deliver services. The core AI functionality, voice processing, transcription, and telephony services are provided 
                by third-party providers including but not limited to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li><strong>OpenAI</strong> - Provides AI language models and natural language processing capabilities</li>
                <li><strong>VAPI (Voice AI Platform Inc.)</strong> - Provides AI voice assistant infrastructure, call handling, and real-time AI interactions</li>
                <li><strong>Telnyx</strong> - Provides telephony infrastructure, phone number provisioning, and call routing services</li>
                <li><strong>Deepgram</strong> - Provides speech-to-text transcription services</li>
                <li>Other third-party providers as may be integrated from time to time</li>
              </ul>
              
              <p className="text-gray-600 mb-4">
                <strong>You acknowledge and agree that:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li><strong>Tavari does not develop, own, or control the underlying AI models, algorithms, or telephony infrastructure</strong> used to provide services</li>
                <li><strong>Tavari is not responsible for, and disclaims all liability arising from,</strong> the performance, availability, accuracy, errors, failures, or limitations of third-party AI service providers</li>
                <li><strong>All AI-generated responses, transcriptions, and call handling are processed by third-party providers,</strong> and Tavari serves only as a platform to facilitate access to these services</li>
                <li><strong>Any errors, inaccuracies, failures, or issues with AI functionality are the responsibility of the third-party providers,</strong> not Tavari</li>
                <li>Third-party providers may change their services, pricing, terms, or discontinue services without notice, which may affect or terminate Tavari's services</li>
                <li>Tavari may change or replace third-party providers at any time in its sole discretion</li>
                <li>Your use of Tavari's services is subject to the terms, conditions, and policies of these third-party providers</li>
                <li><strong>Any claims, damages, or liabilities arising from AI errors, transcription errors, call failures, or service interruptions</strong> should be directed to the responsible third-party provider, not Tavari</li>
              </ul>
              
              <p className="text-gray-600 mb-4">
                <strong>Limitation of Tavari's Role:</strong> Tavari provides a platform and user interface that integrates with third-party services. 
                Tavari does not warrant, guarantee, or assume responsibility for the accuracy, reliability, or performance of any third-party AI, 
                transcription, or telephony services. Tavari's role is limited to providing access to these services and is not responsible for 
                the quality, accuracy, or outcomes of services provided by third-party providers.
              </p>
              
              <p className="text-gray-600 mb-4">
                <strong>Indemnification by Third Parties:</strong> To the extent permitted by law and their respective terms of service, 
                any claims arising from AI functionality, transcription errors, or telephony failures should be pursued directly with the 
                responsible third-party provider (OpenAI, VAPI, Telnyx, Deepgram, etc.), not with Tavari.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. General Limitation of Liability</h2>
              <p className="text-gray-600 mb-4">
                <strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW, TAVARI SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, 
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUES, BUSINESS OPPORTUNITIES, OR GOODWILL, WHETHER INCURRED 
                DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, OR OTHER INTANGIBLE LOSSES, ARISING FROM OR RELATED TO:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>The use or inability to use the Service</li>
                <li>AI-generated errors, inaccuracies, or failures (see Section 10)</li>
                <li>Third-party provider errors, failures, or service interruptions (see Section 10.7)</li>
                <li>Call handling, transcription, or telephony service issues</li>
                <li>Lost or missed calls, messages, or communications</li>
                <li>Business losses, lost sales, or missed opportunities</li>
                <li>Any reliance on AI-generated content without verification</li>
              </ul>
              
              <p className="text-gray-600 mb-4">
                <strong>CAP ON LIABILITY:</strong> TO THE MAXIMUM EXTENT PERMITTED BY LAW, TAVARI'S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS 
                ARISING FROM OR RELATED TO THE SERVICE (INCLUDING AI FUNCTIONALITY, THIRD-PARTY SERVICE ISSUES, AND ALL OTHER CLAIMS) SHALL 
                NOT EXCEED THE TOTAL AMOUNT PAID BY YOU TO TAVARI IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED DOLLARS ($100), 
                WHICHEVER IS GREATER.
              </p>
              
              <p className="text-gray-600 mb-4">
                <strong>THIRD-PARTY SERVICE LIABILITY:</strong> Tavari specifically disclaims all liability for errors, failures, or issues 
                arising from third-party AI, transcription, or telephony services (OpenAI, VAPI, Telnyx, Deepgram, etc.). Any claims related 
                to such services must be directed to the responsible third-party provider in accordance with their respective terms of service 
                and dispute resolution procedures. Tavari's liability is limited to its role as a platform intermediary and does not extend 
                to the underlying services provided by third-party providers.
              </p>
              
              <p className="text-gray-600">
                Some jurisdictions do not allow the exclusion or limitation of certain damages, so the above limitations may not apply to you. 
                In such cases, Tavari's liability will be limited to the fullest extent permitted by applicable law.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Indemnification</h2>
              <p className="text-gray-600 mb-4">
                You agree to indemnify, defend, and hold harmless Tavari, its officers, directors, employees, agents, subsidiaries, 
                affiliates, and licensors from and against any and all claims, demands, actions, causes of action, lawsuits, damages, 
                losses, liabilities, costs, and expenses (including reasonable attorneys' fees, court costs, expert witness fees, and 
                expenses) arising out of or relating to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Your use of the Service, including any AI-generated content, transcriptions, or responses</li>
                <li>Your violation of these Terms of Service</li>
                <li>Your violation of any applicable laws, regulations, or third-party rights</li>
                <li>Your content, data, or information that you provide through the Service</li>
                <li>Any errors, inaccuracies, or issues resulting from your provision of inaccurate business information, FAQs, or configuration data</li>
                <li>Your failure to review, verify, or correct AI-generated content before relying on it</li>
                <li>Any claims brought by third parties (including your customers) arising from AI errors, transcription errors, or service failures</li>
              </ul>
              <p className="text-gray-600 mb-4">
                <strong>Third-Party Provider Claims:</strong> In the event of any claim, lawsuit, or proceeding arising from or relating to 
                AI functionality, transcription errors, call handling failures, or telephony service issues, you agree to first pursue such 
                claims directly with the responsible third-party provider (OpenAI, VAPI, Telnyx, Deepgram, etc.) in accordance with their 
                respective terms of service, and only to the extent such claims cannot be resolved through the third-party provider's 
                dispute resolution process shall such claims be directed to Tavari, subject to the limitations of liability set forth in 
                these Terms.
              </p>
              <p className="text-gray-600">
                <strong>Right to Counter-Claim:</strong> Tavari reserves the right to assert counter-claims, cross-claims, and third-party 
                claims against you or any other party in connection with any legal proceeding, dispute, or claim arising from or relating 
                to the Service or these Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Legal Proceedings and Attorney's Fees</h2>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">13.1 One-Way Fee-Shifting Provision</h3>
              <p className="text-gray-600 mb-4">
                <strong>In the event of any legal proceeding, dispute, lawsuit, arbitration, or other adversarial proceeding (collectively, 
                a "Proceeding") between you and Tavari arising from or relating to the Service, these Terms, or the relationship between 
                the parties:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li><strong>If Tavari substantially prevails on the merits of the case</strong> (whether by judgment, settlement, dismissal, 
                summary judgment, or otherwise), <strong>you agree to pay Tavari all reasonable costs, expenses, and fees incurred in connection 
                with the Proceeding, including but not limited to:</strong>
                  <ul className="list-circle list-inside ml-6 mt-2 space-y-1">
                    <li>Attorneys' fees and legal fees at all trial and appellate levels</li>
                    <li>Court costs and filing fees</li>
                    <li>Expert witness fees and expenses</li>
                    <li>Investigation costs</li>
                    <li>Discovery costs</li>
                    <li>Deposition costs</li>
                    <li>Travel expenses</li>
                    <li>Other litigation expenses</li>
                    <li>Any other costs reasonably incurred in connection with the Proceeding</li>
                  </ul>
                </li>
                <li><strong>This fee-shifting provision is ONE-WAY only:</strong> Tavari is entitled to recover its costs, fees, and expenses 
                if it prevails, but Tavari is NOT obligated to pay your costs, fees, or expenses if you prevail. Each party shall bear their 
                own costs, fees, and expenses unless Tavari prevails, in which case you shall pay Tavari's costs, fees, and expenses.</li>
                <li><strong>This provision applies to all Proceedings,</strong> including but not limited to lawsuits, arbitrations, administrative 
                proceedings, enforcement actions, and any other legal or quasi-legal proceedings, regardless of which party initiates the Proceeding.</li>
                <li><strong>If a Proceeding involves multiple claims or issues and Tavari prevails on any material claim,</strong> you agree to pay 
                Tavari's reasonable costs, fees, and expenses apportioned to the claims on which Tavari prevailed.</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">13.2 Recovery of Defense Costs</h3>
              <p className="text-gray-600 mb-4">
                <strong>In addition to the prevailing party provision above, if you initiate or bring any Proceeding against Tavari that is 
                determined to be frivolous, without merit, or brought in bad faith, you agree to pay Tavari's full costs of defense, including 
                all attorneys' fees, expert fees, and expenses, regardless of the outcome of the Proceeding.</strong>
              </p>
              
              <h3 className="text-xl font-semibold text-gray-800 mb-3">13.3 Counter-Claims and Cross-Claims</h3>
              <p className="text-gray-600 mb-4">
                Tavari reserves the right to assert counter-claims, cross-claims, third-party claims, and any other claims or causes of action 
                against you or any other party in connection with any Proceeding. <strong>If Tavari prevails on any counter-claim, cross-claim, 
                or other claim asserted in response to your claims, Tavari shall be entitled to recover all costs, fees, and expenses as set 
                forth in Section 13.1 above. This one-way fee-shifting provision applies equally to counter-claims, cross-claims, and any other 
                claims asserted by Tavari.</strong>
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">13.4 Enforcement of Fee-Shifting Provision</h3>
              <p className="text-gray-600 mb-4">
                This fee-shifting provision is intended to be enforceable to the fullest extent permitted by law. If any portion of this 
                provision is found to be unenforceable in any jurisdiction, the remainder shall remain in full force and effect, and the 
                parties agree that the court or arbitrator should interpret and apply this provision to maximize its enforceability.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">13.5 Separate and Independent</h3>
              <p className="text-gray-600">
                The rights and remedies set forth in this Section 13 are separate and independent from, and in addition to, any other rights 
                and remedies available to Tavari under these Terms, at law, or in equity, including but not limited to the indemnification 
                provisions set forth in Section 12.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Termination</h2>
              <p className="text-gray-600 mb-4">
                We may terminate or suspend your account immediately, without prior notice, for conduct that we believe violates 
                these Terms or is harmful to other users, us, or third parties.
              </p>
              <p className="text-gray-600">
                You may terminate your account at any time by contacting support. Upon termination, your right to use the Service 
                will cease immediately, and we may delete your account and data in accordance with our data retention policies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Changes to Terms</h2>
              <p className="text-gray-600">
                We reserve the right to modify these Terms at any time. We will notify you of any material changes by posting 
                the new Terms on this page and updating the "Last Updated" date. Your continued use of the Service after such 
                changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">16. Governing Law</h2>
              <p className="text-gray-600">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Tavari 
                operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">17. Contact Information</h2>
              <p className="text-gray-600 mb-2">
                If you have questions about these Terms of Service, please contact us:
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
                <Link href="/privacy" className="text-blue-600 hover:underline text-sm">
                  Privacy Policy
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

