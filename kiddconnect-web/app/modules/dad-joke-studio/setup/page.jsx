import { redirect } from 'next/navigation';

/** Legacy activation used /modules/dad-joke-studio/setup — send users to the real studio. */
export default function DadJokeStudioSetupRedirectPage() {
  redirect('/dashboard/v2/modules/dad-joke-studio/dashboard');
}
