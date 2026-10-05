import Link from 'next/link';
import LegalPage, { LegalSection, ContactLine } from '@/components/LegalPage';
import { APP_DISPLAY_NAME, SITE_URL } from '@/lib/appBrand';

export const metadata = {
  title: `Terms of Service - ${APP_DISPLAY_NAME}`,
  description: `Terms for using ${APP_DISPLAY_NAME}`,
};

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service">
      <LegalSection title="1. About the site">
        <p>
          {APP_DISPLAY_NAME} ({SITE_URL}) is a private family project website with tools for creating videos and
          publishing them to YouTube. By creating an account or using the site, you agree to these terms.
        </p>
      </LegalSection>

      <LegalSection title="2. Accounts">
        <p>
          Accounts are for family members and people we invite. Keep your password private; you are responsible for
          what happens under your account. We may suspend or remove accounts at our discretion.
        </p>
      </LegalSection>

      <LegalSection title="3. Your content">
        <p>
          You keep ownership of the content you create. You are responsible for making sure you have the rights to
          anything you upload or publish, and that it follows the law and the rules of the platforms you publish to.
        </p>
      </LegalSection>

      <LegalSection title="4. YouTube">
        <p>
          Features that publish to YouTube use YouTube API Services. If you connect a YouTube channel, you agree to the{' '}
          <a href="https://www.youtube.com/t/terms" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            YouTube Terms of Service
          </a>
          . See our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link> for how
          YouTube data is handled.
        </p>
      </LegalSection>

      <LegalSection title="5. AI-generated content">
        <p>
          Some tools use AI to generate scripts, images, or audio. AI output can be wrong or unexpected; review
          everything before you publish it.
        </p>
      </LegalSection>

      <LegalSection title="6. Paid features">
        <p>
          If a feature requires payment, the price and billing terms are shown before you pay. Payments are handled by
          our payment processors.
        </p>
      </LegalSection>

      <LegalSection title="7. No warranty">
        <p>
          The site is a family project provided &quot;as is&quot;, without warranties of any kind. To the extent the
          law allows, we are not liable for any loss arising from using it.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes and contact">
        <p>We may update these terms; the date at the top shows when they last changed.</p>
        <ContactLine />
      </LegalSection>
    </LegalPage>
  );
}
