import LegalPage, { LegalSection, ContactLine } from '@/components/LegalPage';
import { APP_DISPLAY_NAME, SITE_URL } from '@/lib/appBrand';

export const metadata = {
  title: `Privacy Policy - ${APP_DISPLAY_NAME}`,
  description: `How ${APP_DISPLAY_NAME} collects, uses, and protects your information`,
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <LegalSection title="1. Who we are">
        <p>
          {APP_DISPLAY_NAME} ({SITE_URL}) is a private family project website. It hosts tools our family uses to
          create videos and publish them to our own YouTube channels. Accounts are for family members and invited
          guests.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <ul className="list-disc pl-6 space-y-1">
          <li>Account details you give us: name, email address, and a password (stored only as a secure hash).</li>
          <li>
            If you use the Contact Us form: your name, email address, and message, which are emailed to us so we can
            reply.
          </li>
          <li>Content you create in the studio tools, such as scripts, images, audio, and rendered videos.</li>
          <li>Basic technical data needed to run the site, such as server logs and the cookie that keeps you logged in.</li>
          <li>
            If you connect a YouTube channel: the channel name and ID, and the OAuth tokens Google issues so the site
            can upload videos on your behalf.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. YouTube API Services">
        <p>
          {APP_DISPLAY_NAME} uses YouTube API Services to upload videos you create to YouTube channels you connect,
          and to read basic channel and video information (such as titles and view counts) for those channels.
        </p>
        <p>
          By connecting a YouTube channel you agree to be bound by the{' '}
          <a href="https://www.youtube.com/t/terms" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            YouTube Terms of Service
          </a>
          . Google&apos;s handling of your data is described in the{' '}
          <a href="https://policies.google.com/privacy" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            Google Privacy Policy
          </a>
          .
        </p>
        <p>
          We only use YouTube data to provide these features. We do not sell it, use it for advertising, or share it
          with anyone else.
        </p>
        <p>
          You can revoke the site&apos;s access at any time from your{' '}
          <a href="https://myaccount.google.com/permissions" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            Google account permissions page
          </a>
          ; the stored tokens then stop working. Disconnecting a channel in a module&apos;s settings deletes its stored
          tokens, and we will delete any remaining YouTube data on request.
        </p>
      </LegalSection>

      <LegalSection title="4. How we use information">
        <p>
          We use your information only to run the site: to log you in, save and render your projects, publish videos
          you choose to publish, and keep the service secure.
        </p>
      </LegalSection>

      <LegalSection title="5. Service providers">
        <p>
          The site runs on third-party infrastructure that processes data on our behalf: Vercel (website hosting),
          Railway (application server), Supabase (database and file storage), Amazon Web Services (email delivery),
          and OpenAI (AI text and image generation for studio tools). Payments, if any, are handled by our payment processors; we do not store card
          numbers.
        </p>
      </LegalSection>

      <LegalSection title="6. Retention and deletion">
        <p>
          We keep your information while your account is active. You can ask us to delete your account and the data
          associated with it at any time, and we will do so unless we must keep something to meet a legal obligation.
        </p>
      </LegalSection>

      <LegalSection title="7. Children">
        <p>
          Children in our family may appear in or help create content, but accounts are managed by parents. We do not
          knowingly collect personal information directly from children without a parent&apos;s involvement.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes and contact">
        <p>We may update this policy; the date at the top shows when it last changed.</p>
        <ContactLine />
      </LegalSection>
    </LegalPage>
  );
}
