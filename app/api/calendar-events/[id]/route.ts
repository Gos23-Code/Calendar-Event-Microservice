import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/infrastructure/database/supabase/client';
import { EventType } from '@/domain/enums/EventType';

// Definir el tipo para los datos de actualización
type UpdateData = {
  pet_id?: string;
  title?: string;
  description?: string | null;
  event_type?: EventType;
  event_date?: string;
  reminder_at?: string | null;
  reminder_enabled?: boolean;
};

// ============================================
// PUT: Actualizar evento
// ============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    // Validar que userId esté presente
    if (!body.userId) {
      return NextResponse.json(
        { error: 'User ID is required in the body' },
        { status: 401 }
      );
    }

    // Verificar que el evento existe y pertenece al usuario
    const { data: existingEvent, error: findError } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existingEvent) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    if (existingEvent.user_id !== body.userId) {
      return NextResponse.json(
        { error: 'Unauthorized to update this event' },
        { status: 403 }
      );
    }

    // Validar eventType
    if (body.eventType && !Object.values(EventType).includes(body.eventType)) {
      return NextResponse.json(
        { error: 'Invalid event type' },
        { status: 400 }
      );
    }

    // Construir objeto de actualización (TIPADO)
    const updateData: UpdateData = {};
    if (body.petId !== undefined) updateData.pet_id = body.petId;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.eventType !== undefined) updateData.event_type = body.eventType;
    if (body.eventDate !== undefined) updateData.event_date = body.eventDate;
    if (body.reminderAt !== undefined) updateData.reminder_at = body.reminderAt;
    if (body.reminderEnabled !== undefined) updateData.reminder_enabled = body.reminderEnabled;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('calendar_events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Error updating event: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE: Eliminar evento
// ============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = request.nextUrl;

    if (!id) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required in the query' },
        { status: 401 }
      );
    }

    // Verificar que el evento existe y pertenece al usuario
    const { data: existingEvent, error: findError } = await supabase
      .from('calendar_events')
      .select('user_id')
      .eq('id', id)
      .single();

    if (findError || !existingEvent) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    if (existingEvent.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this event' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { error: 'Error deleting event: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Event deleted successfully',
      id: id
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}