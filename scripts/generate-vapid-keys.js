/**
 * Generate VAPID keys for Web Push.
 *
 * Note: `web-push` (and some of its transitive deps) are not compatible with Node 25+.
 * This script exits early with a helpful message instead of throwing a stack trace.
 */

const major = Number(process.versions.node.split('.')[0]);

if (Number.isFinite(major) && major >= 23) {
  console.error(
    [
      `[generate-vapid-keys] Detected Node ${process.versions.node}.`,
      `The 'web-push' dependency used by this project is not compatible with Node 23+ (including Node 25).`,
      ``,
      `Fix: switch to Node 20 or 22 (LTS), then re-run: npm run generate-vapid-keys`,
    ].join('\n')
  );
  process.exit(1);
}

let webpush;
try {
  // Lazy require after Node version check
  webpush = require('web-push');
} catch (err) {
  console.error('[generate-vapid-keys] Failed to load web-push. Did you run `npm install`?');
  console.error(err);
  process.exit(1);
}

const keys = webpush.generateVAPIDKeys();

console.log('VAPID keys generated.\n');
console.log('Public Key:\n', keys.publicKey, '\n');
console.log('Private Key:\n', keys.privateKey, '\n');
console.log('Add these to your .env.local:\n');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);


