import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

export async function POST(request: Request) {
  try {
    const { endpoint } = await request.json();
    
    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing endpoint' },
        { status: 400 }
      );
    }

    // Remove the subscription from the database
    await query(
      `DELETE FROM push_subscriptions WHERE endpoint = ?`,
      [endpoint]
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