-- Migración: tabla de citas (CAL-03 de CALENDAR_SERVICE_CHANGES.md)
-- Aplicada manualmente en el SQL Editor de Supabase. Un script ya aplicado no se edita:
-- los cambios van en una migración nueva.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY,
  veterinary_id UUID NOT NULL,
  employee_id UUID,                      -- veterinario asignado; puede ser NULL solo mientras la cita está REQUESTED
  pet_id UUID NOT NULL,
  owner_user_id UUID,                    -- NULL si el dueño no tiene app
  service_id UUID NOT NULL,
  service_name VARCHAR(120) NOT NULL,    -- snapshot
  duration_minutes INT NOT NULL,         -- snapshot
  price NUMERIC(12,2),                   -- snapshot
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL,           -- REQUESTED, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW, REJECTED
  origin VARCHAR(10) NOT NULL,           -- APP, CLINIC
  notes TEXT,
  cancellation_reason TEXT,
  cancelled_by VARCHAR(10),              -- OWNER, CLINIC
  reminder_sent_at TIMESTAMPTZ,          -- para no repetir el recordatorio
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_appt_time CHECK (ends_at > starts_at),
  -- una cita confirmada o en curso siempre tiene veterinario asignado
  CONSTRAINT ck_appt_employee_required CHECK (
    status NOT IN ('CONFIRMED','CHECKED_IN') OR employee_id IS NOT NULL
  ),
  -- evita la doble reserva del mismo veterinario
  CONSTRAINT no_overlap EXCLUDE USING gist (
    employee_id WITH =, tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('REQUESTED','CONFIRMED','CHECKED_IN'))
);

CREATE INDEX IF NOT EXISTS ix_appt_vet_time ON public.appointments(veterinary_id, starts_at);
CREATE INDEX IF NOT EXISTS ix_appt_employee_time ON public.appointments(employee_id, starts_at);
CREATE INDEX IF NOT EXISTS ix_appt_owner ON public.appointments(owner_user_id, starts_at);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
