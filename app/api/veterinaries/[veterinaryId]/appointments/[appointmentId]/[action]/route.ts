import { NextRequest, NextResponse } from 'next/server';
import { getAppointmentHttpDeps } from '@/infrastructure/composition/appointmentDependencies';
import { handleAppointmentAction } from '@/infrastructure/http/appointmentHandlers';
import { toErrorResponse } from '@/infrastructure/http/errorBody';

// PATCH /api/veterinaries/{veterinaryId}/appointments/{appointmentId}/{action}
// action: confirm | reject | cancel | check-in | complete | no-show | reschedule
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ veterinaryId: string; appointmentId: string; action: string }> }
) {
  const { veterinaryId, appointmentId, action } = await params;
  const now = new Date();

  try {
    const deps = getAppointmentHttpDeps();
    // El cuerpo es opcional en algunas acciones (confirm, check-in, etc.)
    const body = await request.json().catch(() => undefined);

    const result = await handleAppointmentAction(
      { authorization: request.headers.get('authorization'), veterinaryId, appointmentId, action, body, now },
      { authenticate: deps.authenticate, lifecycle: deps.lifecycle }
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('❌ PATCH appointment action:', error);
    const { status, body } = toErrorResponse(error, now);
    return NextResponse.json(body, { status });
  }
}
