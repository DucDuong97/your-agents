import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { query } from '@/lib/server/db';

// Generate VAPID keys using web-push generate-vapid-keys
const vapidKeys = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || ''
};

webpush.setVapidDetails(
  'mailto:dmd@steadyapp.dev',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export async function POST(request: Request) {
  try {
    const subscription = await request.json();
    
    if (!subscription) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Store the subscription in the database
    await query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
       endpoint = VALUES(endpoint),
       p256dh = VALUES(p256dh),
       auth = VALUES(auth)`,
      [
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth
      ]
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving subscription:', error);
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 }
    );
  }
}