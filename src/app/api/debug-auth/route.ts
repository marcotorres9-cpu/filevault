import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cookieHeader = request.headers.get('cookie');

  const session = await getSession(request);

  return NextResponse.json({
    authHeader: authHeader ? authHeader.substring(0, 30) + '...' : 'NONE',
    hasCookie: !!cookieHeader,
    session: session ? { userId: session.userId, username: session.username } : null,
  });
}