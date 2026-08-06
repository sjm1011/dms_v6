import { NextRequest } from 'next/server';
import { requireAdmin, requireSession } from '../../../../lib/server/auth';
import {
  archiveAnnouncement,
  createAnnouncementDraft,
  listAnnouncements,
  type AnnouncementMutationInput,
  updateAnnouncement
} from '../../../../lib/server/dashboardService';
import { fail, ok, parseJsonBody, systemRouteError } from '../../../../lib/server/http';

export const dynamic = 'force-dynamic';

const announcementRouteError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('公告版次已變更')) return fail(message, 409);
  return systemRouteError(error);
};

export const GET = async (request: NextRequest) => {
  try {
    requireAdmin(requireSession(request).user);
    const params = request.nextUrl.searchParams;
    const response = ok(await listAnnouncements({
      status: params.get('status') || '',
      page: Number(params.get('page') || 1),
      pageSize: Number(params.get('page_size') || 20)
    }));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return announcementRouteError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    requireAdmin(session.user);
    const body = await parseJsonBody<AnnouncementMutationInput>(request);
    return ok(await createAnnouncementDraft(session.user, body), 201);
  } catch (error) {
    return announcementRouteError(error);
  }
};

export const PUT = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    requireAdmin(session.user);
    const body = await parseJsonBody<AnnouncementMutationInput>(request);
    return ok(await updateAnnouncement(session.user, body));
  } catch (error) {
    return announcementRouteError(error);
  }
};

export const DELETE = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    requireAdmin(session.user);
    const body = await parseJsonBody<{ announcement_id?: number; revision?: number }>(request);
    await archiveAnnouncement(
      session.user,
      Number(body.announcement_id),
      Number(body.revision)
    );
    return ok(null);
  } catch (error) {
    return announcementRouteError(error);
  }
};
