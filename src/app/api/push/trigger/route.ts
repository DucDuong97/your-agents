import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { query } from '@/lib/server/db';
import { RowDataPacket } from 'mysql2';

interface PushSubscriptionRow extends RowDataPacket {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const vapidKeys = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || ''
};

webpush.setVapidDetails(
  'mailto:dmd@steadyapp.dev',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export async function GET() {
  try {
    // Fetch the subscription from the database
    const subscriptions = await query<PushSubscriptionRow[]>(
      `SELECT endpoint, p256dh, auth 
       FROM push_subscriptions`,
      []
    );

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { error: 'No active subscription found for this device' },
        { status: 404 }
      );
    }

    const notificationPayload = {
      title: 'Chat Bot Message',
      body: 'This is a test message',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      data: {
        url: '/'
      }
    };

    console.log('Sending notification with payload:', notificationPayload);

    for (const subscription of subscriptions) {
      // Convert database subscription to web-push format
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      };
      
      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(notificationPayload)
        );
        console.log('Notification sent successfully');
      } catch (error: any) {
        console.error('Error sending to subscription:', error);
        if (error.statusCode && error.statusCode == 410) {
          // Remove the subscription from the database
          await query(
            'DELETE FROM push_subscriptions WHERE endpoint = ?',
            [subscription.endpoint]
          );
        }
        // Continue with other subscriptions even if one fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
} 