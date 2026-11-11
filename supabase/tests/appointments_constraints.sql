-- Prueba manual de las restricciones de public.appointments (Fase 1).
-- Ejecutar en el SQL Editor de Supabase. Todo corre dentro de una transacción
-- que termina en ROLLBACK: no deja filas en la tabla.
-- Si alguna prueba falla, aparece un error con "FALLO:" en el mensaje.

BEGIN;

-- Datos base: una cita CONFIRMED del veterinario E1 de 10:00 a 11:00 (UTC)
INSERT INTO public.appointments (
  id, veterinary_id, employee_id, pet_id, service_id, service_name,
  duration_minutes, starts_at, ends_at, status, origin, created_by
) VALUES (
  '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000d001',
  '00000000-0000-0000-0000-000000005001', 'Consulta general',
  60, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', 'CONFIRMED', 'CLINIC',
  '00000000-0000-0000-0000-00000000c001'
);

-- 1. Doble reserva del mismo veterinario en franja solapada: debe FALLAR
DO $$
BEGIN
  INSERT INTO public.appointments (
    id, veterinary_id, employee_id, pet_id, service_id, service_name,
    duration_minutes, starts_at, ends_at, status, origin, created_by
  ) VALUES (
    '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000d002',
    '00000000-0000-0000-0000-000000005001', 'Consulta general',
    60, '2026-12-01T10:30:00Z', '2026-12-01T11:30:00Z', 'CONFIRMED', 'CLINIC',
    '00000000-0000-0000-0000-00000000c001'
  );
  RAISE EXCEPTION 'FALLO: se permitió una doble reserva del mismo veterinario';
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE NOTICE 'OK 1: doble reserva rechazada';
END $$;

-- 2. Misma franja pero contigua (11:00 a 12:00): debe PERMITIRSE
INSERT INTO public.appointments (
  id, veterinary_id, employee_id, pet_id, service_id, service_name,
  duration_minutes, starts_at, ends_at, status, origin, created_by
) VALUES (
  '00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000d003',
  '00000000-0000-0000-0000-000000005001', 'Consulta general',
  60, '2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z', 'CONFIRMED', 'CLINIC',
  '00000000-0000-0000-0000-00000000c001'
);
-- (si llegó aquí, OK 2)

-- 3. Otro veterinario en la misma franja: debe PERMITIRSE
INSERT INTO public.appointments (
  id, veterinary_id, employee_id, pet_id, service_id, service_name,
  duration_minutes, starts_at, ends_at, status, origin, created_by
) VALUES (
  '00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000d004',
  '00000000-0000-0000-0000-000000005001', 'Consulta general',
  60, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', 'CONFIRMED', 'CLINIC',
  '00000000-0000-0000-0000-00000000c001'
);
-- (si llegó aquí, OK 3)

-- 4. CONFIRMED sin veterinario asignado: debe FALLAR (ck_appt_employee_required)
DO $$
BEGIN
  INSERT INTO public.appointments (
    id, veterinary_id, employee_id, pet_id, service_id, service_name,
    duration_minutes, starts_at, ends_at, status, origin, created_by
  ) VALUES (
    '00000000-0000-0000-0000-00000000a005', '00000000-0000-0000-0000-0000000000b1',
    NULL, '00000000-0000-0000-0000-00000000d005',
    '00000000-0000-0000-0000-000000005001', 'Consulta general',
    60, '2026-12-02T10:00:00Z', '2026-12-02T11:00:00Z', 'CONFIRMED', 'CLINIC',
    '00000000-0000-0000-0000-00000000c001'
  );
  RAISE EXCEPTION 'FALLO: se permitió CONFIRMED sin veterinario';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK 4: CONFIRMED sin veterinario rechazado';
END $$;

-- 5. REQUESTED sin veterinario: debe PERMITIRSE
INSERT INTO public.appointments (
  id, veterinary_id, employee_id, pet_id, service_id, service_name,
  duration_minutes, starts_at, ends_at, status, origin, created_by
) VALUES (
  '00000000-0000-0000-0000-00000000a006', '00000000-0000-0000-0000-0000000000b1',
  NULL, '00000000-0000-0000-0000-00000000d006',
  '00000000-0000-0000-0000-000000005001', 'Consulta general',
  60, '2026-12-03T10:00:00Z', '2026-12-03T11:00:00Z', 'REQUESTED', 'APP',
  '00000000-0000-0000-0000-00000000c001'
);
-- (si llegó aquí, OK 5)

-- 6. ends_at anterior a starts_at: debe FALLAR (ck_appt_time)
DO $$
BEGIN
  INSERT INTO public.appointments (
    id, veterinary_id, employee_id, pet_id, service_id, service_name,
    duration_minutes, starts_at, ends_at, status, origin, created_by
  ) VALUES (
    '00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000d007',
    '00000000-0000-0000-0000-000000005001', 'Consulta general',
    60, '2026-12-04T11:00:00Z', '2026-12-04T10:00:00Z', 'CONFIRMED', 'CLINIC',
    '00000000-0000-0000-0000-00000000c001'
  );
  RAISE EXCEPTION 'FALLO: se permitió ends_at anterior a starts_at';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK 6: ends_at anterior a starts_at rechazado';
END $$;

ROLLBACK;
