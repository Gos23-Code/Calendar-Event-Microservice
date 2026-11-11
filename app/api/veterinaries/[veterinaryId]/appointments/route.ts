import { NextRequest, NextResponse } from 'next/server';
import { getAppointmentHttpDeps } from '@/infrastructure/composition/appointmentDependencies';
import { handleCreateClinicAppointment } from '@/infrastructure/http/appointmentHandlers';
import { toErrorResponse } from '@/infrastructure/http/errorBody';

// POST /api/veterinaries/{veterinaryId}/appointments — la clínica crea una cita (nace CONFIRMED)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ veterinaryId: string }> }
) {
  const { veterinaryId } = await params;
  const now = new Date();

  try {
    const deps = getAppointmentHttpDeps();
    const body = await request.json().catch(() => undefined);

    const result = await handleCreateClinicAppointment(
      { authorization: request.headers.get('authorization'), veterinaryId, body, now },
      { authenticate: deps.authenticate, useCase: deps.clinicUseCase }
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // Fallo de configuración del servidor (variables de entorno) u otro inesperado
    console.error('❌ POST appointments:', error);
    const { status, body } = toErrorResponse(error, now);
    return NextResponse.json(body, { status });
  }
}
