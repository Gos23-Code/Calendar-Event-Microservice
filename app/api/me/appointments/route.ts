import { NextRequest, NextResponse } from 'next/server';
import { getAppointmentHttpDeps } from '@/infrastructure/composition/appointmentDependencies';
import { handleOwnerAppointments } from '@/infrastructure/http/appointmentHandlers';
import { toErrorResponse } from '@/infrastructure/http/errorBody';

// GET /api/me/appointments?from=&to= — citas del dueño en todas las clínicas
export async function GET(request: NextRequest) {
  const now = new Date();

  try {
    const deps = getAppointmentHttpDeps();
    const result = await handleOwnerAppointments(
      { authorization: request.headers.get('authorization'), params: request.nextUrl.searchParams, now },
      { authenticate: deps.authenticate, owner: deps.owner }
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('❌ GET me/appointments:', error);
    const { status, body } = toErrorResponse(error, now);
    return NextResponse.json(body, { status });
  }
}
