import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db';
import { ensureWebPushConfigured } from '@/lib/server/webpush';

export async function POST(request: Request) {
  try {
    // Ensure env is present and web-push is configured (even if this route doesn't send)
    ensureWebPushConfigured();

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