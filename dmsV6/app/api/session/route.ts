import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '../../../lib/session';
import { getUserThemeOrDefault } from '../../../lib/server/userPreferenceService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({
      success: false,
      data: null,
      error: '尚未登入或登入狀態已失效。'
    });
  }

  try {
    const theme = await getUserThemeOrDefault(session.user.id);
    return NextResponse.json({
      success: true,
      data: { user: session.user, theme },
      error: ''
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: null,
      error: `伺服器處理失敗：${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
};
