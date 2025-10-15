// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/evidence-cards', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/'] };
