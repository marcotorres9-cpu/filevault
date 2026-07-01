import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Build absolute URL for redirect (Vercel requires absolute URLs)
  // Fix: previous version used relative path '/app' which threw 500 in production
  const url = new URL('/app?v=35', request.url);
  return NextResponse.redirect(url, 307);
}