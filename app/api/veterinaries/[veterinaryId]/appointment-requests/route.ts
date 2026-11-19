import { NextRequest, NextResponse } from 'next/server';
import { getAppointmentHttpDeps } from '@/infrastructure/composition/appointmentDependencies';
import { handleRequestAppointment } from '@/infrastructure/http/appointmentHandlers';
import { toErrorResponse } from '@/infrastructure/http/errorBody';

// POST /api/veterinaries/{veterinaryId}/appointment-requests — el dueño solicita desde la app
// (nace REQUESTED o CONFIRMED según bookingRequiresConfirmation de la clínica)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ veterinaryId: string }> }
) {
  const { veterinaryId } = await params;
  const now = new Date();

  try {
    const deps = getAppointmentHttpDeps();
    const body = await request.json().catch(() => undefined);

    const result = await handleRequestAppointment(
      { authorization: request.headers.get('authorization'), veterinaryId, body, now },
      { authenticate: deps.authenticate, useCase: deps.requestUseCase, pets: deps.petDirectory }
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('❌ POST appointment-requests:', error);
    const { status, body } = toErrorResponse(error, now);
    return NextResponse.json(body, { status });
  }
}
