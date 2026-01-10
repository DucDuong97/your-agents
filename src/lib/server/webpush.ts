import webpush from 'web-push';

let configured = false;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function ensureWebPushConfigured() {
  if (configured) return;

  const subject = process.env.VAPID_SUBJECT || 'mailto:dmd@steadyapp.dev';
  const publicKey = getRequiredEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  const privateKey = getRequiredEnv('VAPID_PRIVATE_KEY');

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export { webpush };


