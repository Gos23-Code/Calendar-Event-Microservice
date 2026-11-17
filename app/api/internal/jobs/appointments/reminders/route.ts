import { NextRequest, NextResponse } from 'next/server';
import { getAppointmentHttpDeps } from '@/infrastructure/composition/appointmentDependencies';
import { handleSendReminders } from '@/infrastructure/http/appointmentHandlers';
import { INTERNAL_API_KEY_HEADER } from '@/infrastructure/auth/internalApiKey';
import { toErrorResponse } from '@/infrastructure/http/errorBody';

// POST /api/internal/jobs/appointments/reminders — recordatorios de citas en 23–24 h.
// Solo para el scheduler: requiere X-Internal-Api-Key y nunca se expone por el gateway.
export async function POST(request: NextRequest) {
  const now = new Date();

  try {
    const deps = getAppointmentHttpDeps();
    const result = await handleSendReminders(
      { internalApiKey: request.headers.get(INTERNAL_API_KEY_HEADER), now },
      { expectedKey: deps.internalApiKey, job: deps.reminders }
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('❌ POST appointment reminders job:', error);
    const { status, body } = toErrorResponse(error, now);
    return NextResponse.json(body, { status });
  }
}
