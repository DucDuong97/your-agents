import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

export async function POST(request: Request) {
  try {
    const { deviceId } = await request.json();
    
    if (!deviceId) {
      return NextResponse.json(
        { error: 'Missing deviceId' },
        { status: 400 }
      );
    }

    // Remove the subscription from the database
    await query(
      `DELETE FROM push_subscriptions WHERE device_id = ?`,
      [deviceId]
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing subscription:', error);
    return NextResponse.json(
      { error: 'Failed to remove subscription' },
      { status: 500 }
    );
  }
} 