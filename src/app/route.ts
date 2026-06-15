import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://filevault-sigma.vercel.app';
  return NextResponse.redirect(`${baseUrl}/app?v=35`, 307);
}