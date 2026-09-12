import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/infrastructure/database/supabase/client';
import { EventType } from '@/domain/enums/EventType';

// ============================================
// POST: Crear un nuevo evento
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validar campos requeridos (petId es opcional: su ausencia indica un evento
    // de calendario de usuario en vez de un evento asociado a una mascota)
    if (!body.title || !body.eventType || !body.eventDate) {
      return NextResponse.json(
        { error: 'Missing required fields: title, eventType, eventDate' },
        { status: 400 }
      );
    }

    if (!Object.values(EventType).includes(body.eventType)) {
      return NextResponse.json(
        { error: 'Invalid event type' },
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

    console.log('📝 Creando evento para userId:', body.userId);

    // Insertar con el user_id correspondiente
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        user_id: body.userId,
        pet_id: body.petId || null,
        title: body.title,
        description: body.description || null,
        event_type: body.eventType,
        event_date: body.eventDate,
        reminder_at: body.reminderAt || null,
        reminder_enabled: body.reminderEnabled ?? false
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Error creating event: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// GET: Listar eventos por usuario
// ============================================
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    // calendarType: 'user' -> solo eventos sin mascota (calendario A)
    //               'pet'  -> solo eventos con mascota (calendario B)
    //               ausente -> todos los eventos del usuario
    const calendarType = searchParams.get('calendarType');
    const petId = searchParams.get('petId');

    // Se admite userId, petId, o ambos — pero al menos uno debe estar presente
    if (!userId && !petId) {
      return NextResponse.json(
        { error: 'User ID or Pet ID is required in the query' },
        { status: 401 }
      );
    }

    console.log('📝 Listando eventos para userId:', userId, 'petId:', petId);

    let query = supabase
      .from('calendar_events')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (petId) {
      query = query.eq('pet_id', petId);
    } else if (calendarType === 'user') {
      query = query.is('pet_id', null);
    } else if (calendarType === 'pet') {
      query = query.not('pet_id', 'is', null);
    }

    const { data, error } = await query.order('event_date', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Error fetching events: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      events: data,
      user_id: userId,
      pet_id: petId
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}