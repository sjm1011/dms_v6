import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export const GET = (request: NextRequest) => {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({
      success: false,
      data: null,
      error: '尚未登入或登入狀態已失效。'
    });
  }

  return NextResponse.json({
    success: true,
    data: session.user,
    error: ''
  });
};
