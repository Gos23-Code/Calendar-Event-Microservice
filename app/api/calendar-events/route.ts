import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/infrastructure/database/supabase/client';
import { EventType } from '@/domain/enums/EventType';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validar campos requeridos
    if (!body.petId || !body.title || !body.eventType || !body.eventDate) {
      return NextResponse.json(
        { error: 'Missing required fields: petId, title, eventType, eventDate' },
        { status: 400 }
      );
    }

    if (!Object.values(EventType).includes(body.eventType)) {
      return NextResponse.json(
        { error: 'Invalid event type' },
        { status: 400 }
      );
    }

    // 🔥 INTENTAR OBTENER EL USUARIO DEL TOKEN (si existe)
    let userId = '00000000-0000-0000-0000-000000000000'; // Default: usuario anónimo
    
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          userId = user.id; // 👈 Usuario autenticado, usar su ID real
          console.log('✅ Usuario autenticado:', user.email, 'ID:', userId);
        }
      } catch {
        console.log('⚠️ Token inválido o expirado, usando usuario anónimo');
      }
    } else {
      console.log('👤 Sin token, usando usuario anónimo (00000000...)');
    }

    // Insertar con el user_id correspondiente
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        user_id: userId, // 👈 Aquí va el ID correspondiente
        pet_id: body.petId,
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

    return NextResponse.json({
      ...data,
      auth_mode: userId === '00000000-0000-0000-0000-000000000000' ? 'anonymous' : 'authenticated'
    }, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// GET: Listar eventos (con o sin autenticación)
export async function GET(request: NextRequest) {
  try {
    let userId = '00000000-0000-0000-0000-000000000000';
    
    // Intentar obtener el usuario del token
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          userId = user.id;
        }
      } catch {
        // Token inválido, seguir como anónimo
      }
    }

    // Si es anónimo, ver todos los eventos (para pruebas)
    // Si está autenticado, solo ver sus eventos
    let query = supabase.from('calendar_events').select('*');
    
    if (userId !== '00000000-0000-0000-0000-000000000000') {
      query = query.eq('user_id', userId);
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
      auth_mode: userId === '00000000-0000-0000-0000-000000000000' ? 'anonymous' : 'authenticated',
      user_id: userId
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}