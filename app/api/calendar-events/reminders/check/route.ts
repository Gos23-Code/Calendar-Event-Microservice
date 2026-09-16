import { NextResponse } from 'next/server';
import { checkDueReminders } from '@/infrastructure/pubsub/checkDueReminders';

// ============================================
// GET: Revisar y notificar recordatorios vencidos
// ============================================
export async function GET() {
  try {
    const result = await checkDueReminders();
    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
