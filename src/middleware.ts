import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Force no-cache on HTML and JS resources
  const path = request.nextUrl.pathname;
  if (
    path.endsWith('.js') ||
    path.endsWith('.jsx') ||
    path.endsWith('.ts') ||
    path.endsWith('.tsx') ||
    path === '/app' ||
    path === '/app/' ||
    path === '/' ||
    path.endsWith('.html') ||
    path.endsWith('.css')
  ) {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|icon-|logo-|FileVault-|favicon|robots|manifest).*)',
  ],
};