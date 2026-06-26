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
// PUT: Actualizar un evento existente
// ============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validar que el ID esté presente
    if (!id) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    // Verificar autenticación
    let userId = '00000000-0000-0000-0000-000000000000';
    let isAuthenticated = false;
    
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          userId = user.id;
          isAuthenticated = true;
        }
      } catch {
        console.log('⚠️ Token inválido o expirado');
      }
    }

    // Si no está autenticado, no puede actualizar
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized. You must be logged in to update an event' },
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

    // Verificar que el evento pertenece al usuario autenticado
    if (existingEvent.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to update this event' },
        { status: 403 }
      );
    }

    // Validar eventType si viene en el body
    if (body.eventType && !Object.values(EventType).includes(body.eventType)) {
      return NextResponse.json(
        { error: 'Invalid event type. Must be: VET_APPOINTMENT, MEDICATION, TREATMENT, GROOMING, or OTHER' },
        { status: 400 }
      );
    }

    // Construir objeto de actualización (solo campos enviados)
    const updateData: UpdateData = {};
    if (body.petId !== undefined) updateData.pet_id = body.petId;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.eventType !== undefined) updateData.event_type = body.eventType;
    if (body.eventDate !== undefined) updateData.event_date = body.eventDate;
    if (body.reminderAt !== undefined) updateData.reminder_at = body.reminderAt;
    if (body.reminderEnabled !== undefined) updateData.reminder_enabled = body.reminderEnabled;

    // Si no hay campos para actualizar
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Actualizar el evento
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

    return NextResponse.json({
      ...data,
      auth_mode: 'authenticated'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE: Eliminar un evento
// ============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 👈 ELIMINADO: const body = await request.json();

    // Validar que el ID esté presente
    if (!id) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    // Verificar autenticación
    let userId = '00000000-0000-0000-0000-000000000000';
    let isAuthenticated = false;
    
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          userId = user.id;
          isAuthenticated = true;
        }
      } catch {
        console.log('⚠️ Token inválido o expirado');
      }
    }

    // Si no está autenticado, no puede eliminar
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized. You must be logged in to delete an event' },
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

    // Verificar que el evento pertenece al usuario autenticado
    if (existingEvent.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this event' },
        { status: 403 }
      );
    }

    // Eliminar el evento
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
      id: id,
      auth_mode: 'authenticated'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH: Actualizar parcialmente un evento
// ============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validar que el ID esté presente
    if (!id) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    // Verificar autenticación
    let userId = '00000000-0000-0000-0000-000000000000';
    let isAuthenticated = false;
    
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          userId = user.id;
          isAuthenticated = true;
        }
      } catch {
        console.log('⚠️ Token inválido o expirado');
      }
    }

    if (!isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
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

    if (existingEvent.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to update this event' },
        { status: 403 }
      );
    }

    // Validar eventType si viene en el body
    if (body.eventType && !Object.values(EventType).includes(body.eventType)) {
      return NextResponse.json(
        { error: 'Invalid event type' },
        { status: 400 }
      );
    }

    // Construir objeto de actualización (solo campos enviados)
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

    // Actualizar el evento
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

    return NextResponse.json({
      ...data,
      auth_mode: 'authenticated'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}