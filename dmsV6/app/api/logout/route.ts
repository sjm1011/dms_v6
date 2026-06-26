import { NextResponse } from 'next/server';
import { clearSessionCookie } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export const POST = () => {
  const response = NextResponse.json({
    success: true,
    data: null,
    error: ''
  });

  clearSessionCookie(response);
  return response;
};
