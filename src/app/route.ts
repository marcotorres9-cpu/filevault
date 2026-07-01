import { NextResponse } from 'next/server';

export async function GET() {
  // Use NEXT_PUBLIC_APP_URL if set, otherwise redirect to /app on the current host.
  // The previous hard-coded URL pointed to a stale Vercel project domain.
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (explicitUrl) {
    return NextResponse.redirect(`${explicitUrl}/app?v=35`, 307);
  }
  return NextResponse.redirect(`/app?v=35`, 307);
}