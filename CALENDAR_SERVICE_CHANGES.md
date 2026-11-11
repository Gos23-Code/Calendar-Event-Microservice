# Cambios en el servicio de Calendar (citas) para MyAnimaLogVet

> Leer junto con `CONTRATOS_COMPARTIDOS.md` (sobre de eventos, formato de error, autenticación entre servicios).
> Este documento define **qué debe hacer Calendar**. Lo que Calendar necesita de Veterinary y todavía no existe está en la sección "Dependencias de Veterinary", marcado como pendiente.

---

## Convenciones del equipo (aplican a todo este documento)

- **Autenticación:** el JWT lo emite solo el servicio User. Calendar lo valida con JWKS (`/.well-known/jwks.json`), verificando `iss=myanimalog-user-service` y `aud=myanimalog-api`. Los endpoints `/internal/**` y los jobs usan el header `X-Internal-Api-Key` (comparación en tiempo constante, falla al arrancar si la variable no está definida) y nunca se exponen por el gateway.
- **Tokens:** hay dos tipos. El **token base** (`ctx=USER`) es el del dueño. El **token de clínica** (`ctx=VETERINARY`) trae `vet_id`, `vet_role`, `employee_id`, `vet_licensed` y `vet_status`.
- **Multi-tenant:** cada clínica es un tenant. Si el `vet_id` del token no coincide con el `{veterinaryId}` de la ruta, o si el recurso pertenece a otra clínica, la respuesta es **404** (no 403), para no revelar que existe.
- **Formato de error:** `{ "timestamp", "status", "error", "message", "code" }`. El frontend decide siempre por `code`.
- **SQL:** scripts idempotentes, con `public.` explícito y RLS activado. Un script ya aplicado nunca se edita: los cambios van en un script nuevo.
- **Variables de entorno:** sin espacios al inicio ni al final.

---

## CAL-01 — Validar el JWT

Mismo patrón que los demás servicios: JWKS, `iss`, `aud`, y `X-Internal-Api-Key` para `/internal/**` y los jobs.

## CAL-02 — Autorización

**Token de clínica:**
- Toda operación sobre citas de la clínica requiere el permiso `APPOINTMENT_MANAGE` y que `vet_id` coincida con el `veterinaryId` de la ruta (si no, 404).
- Los permisos **no se leen del token**: Veterinary los resuelve desde su base en cada petición. Calendar debe consultárselos (ver "Dependencias de Veterinary", punto 3) y puede cachearlos hasta 60 segundos.
- Para operaciones sobre una mascota concreta, consultar el endpoint interno `access` de Veterinary (caché de 60 s).

**Token base (dueño):** solo puede solicitar, ver y cancelar citas de **sus** mascotas, y solo si se cumple todo esto:
- la mascota es suya (verificación contra Pets);
- la clínica está `ACTIVE`;
- la clínica tiene `allowOnlineBooking = true`;
- la mascota está compartida con esa clínica.

## CAL-03 — Modelo de cita

```sql
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
```

Notas:
- Postgres no detecta choques cuando `employee_id` es `NULL`. Por eso una cita **no puede pasar a `CONFIRMED` sin veterinario**: si la solicitud llegó con "cualquiera disponible", la clínica (o el sistema, al confirmar) debe asignarle uno, y ahí actúa el `no_overlap`.
- Precio, nombre y duración del servicio se copian al crear la cita. Si la clínica cambia el precio después, la cita conserva el original.

### Transiciones permitidas

```
REQUESTED ──confirm──▶ CONFIRMED ──check-in──▶ CHECKED_IN ──complete──▶ COMPLETED
    │                     │    └──no-show──▶ NO_SHOW
    └──reject──▶ REJECTED └──cancel──▶ CANCELLED (también desde REQUESTED)
```

- Una cita creada por la clínica nace `CONFIRMED`.
- Una cita desde la app nace `REQUESTED` si la clínica tiene `bookingRequiresConfirmation`; si no, nace `CONFIRMED`.
- El dueño solo puede cancelar con al menos `cancellationMinHours` de anticipación.
- `NO_SHOW` solo se permite después de `starts_at`.

## CAL-04 — Disponibilidad

`GET /veterinaries/{veterinaryId}/availability?serviceId=&date=&employeeId=` (dueño o clínica)

1. Pedir a Veterinary las reglas de agenda: `GET /internal/veterinaries/{id}/schedule-rules?from=&to=&employeeId=` (caché de 5 min). *(Endpoint pendiente, ver "Dependencias de Veterinary".)*
2. Generar franjas de `durationMinutes` dentro de `businessHours` ∩ horario del empleado, y restar `blocks` y las citas activas (`REQUESTED`, `CONFIRMED`, `CHECKED_IN`).
3. No ofrecer franjas en el pasado ni con menos de 1 hora de anticipación para reservas desde la app.
4. Respuesta: `[{ startsAt, endsAt, employeeId, employeeName }]`, en la zona horaria de la clínica.

## CAL-05 — Endpoints

| Método | Ruta | Quién | Acción |
|---|---|---|---|
| GET | `/veterinaries/{id}/availability` | dueño / clínica | Franjas libres |
| POST | `/veterinaries/{id}/appointments` | clínica | Crear (nace `CONFIRMED`) |
| POST | `/veterinaries/{id}/appointment-requests` | dueño | Solicitar desde la app |
| GET | `/veterinaries/{id}/appointments?from=&to=&employeeId=&status=` | clínica | Agenda (día, semana, por veterinario) |
| GET | `/me/appointments` | dueño | Mis citas en todas las clínicas |
| PATCH | `/veterinaries/{id}/appointments/{aid}/confirm` | clínica | Confirmar |
| PATCH | `/veterinaries/{id}/appointments/{aid}/reject` | clínica | Rechazar (con motivo) |
| PATCH | `/veterinaries/{id}/appointments/{aid}/reschedule` | clínica / dueño | Reprogramar (revalida disponibilidad) |
| PATCH | `/veterinaries/{id}/appointments/{aid}/cancel` | clínica / dueño | Cancelar |
| PATCH | `/veterinaries/{id}/appointments/{aid}/check-in` | clínica | Llegó |
| PATCH | `/veterinaries/{id}/appointments/{aid}/complete` | clínica | Atendida; la web abre el formulario de visita en Medical con `appointmentId` |
| PATCH | `/veterinaries/{id}/appointments/{aid}/no-show` | clínica | No asistió |
| POST | `/internal/jobs/appointments/reminders` | Cloud Scheduler | Recordatorios |

## CAL-06 — Eventos y recordatorios

Topic `veterinary-appointments`, con el sobre común de `CONTRATOS_COMPARTIDOS.md`. `userId` es el dueño (o `null` más un `recipient` con el contacto si no tiene app, obtenido de Pets). El payload siempre incluye `veterinaryName`, `address`, `phone`, `petName`, `serviceName`, `startsAt` y `timezone`.

| Evento | Cuándo |
|---|---|
| `APPOINTMENT_REQUESTED` | El dueño solicita (destinatario: la clínica) |
| `APPOINTMENT_CONFIRMED` | La clínica confirma o crea |
| `APPOINTMENT_REJECTED` | La clínica rechaza |
| `APPOINTMENT_RESCHEDULED` | Cambio de hora |
| `APPOINTMENT_CANCELLED` | Cualquiera cancela (destinatario: la otra parte) |
| `APPOINTMENT_REMINDER` | Job cada hora: citas `CONFIRMED` que empiezan en 23–24 h; al enviar, marcar `reminder_sent_at` para no repetir |
| `APPOINTMENT_COMPLETED` | Cita atendida (sirve para una encuesta de satisfacción a futuro) |

Los eventos deben publicarse detrás de un flag de configuración (`EVENTS_ENABLED`), porque el sobre común y los topics de Pub/Sub todavía se están definiendo con Notifications.

---

## Dependencias de Veterinary (pendientes, Fase 5)

Calendar necesita lo siguiente de Veterinary. **Nada de esto existe todavía**: los contratos JSON se definirán en conjunto, así que no se deben dar por cerrados.

1. **`GET /internal/veterinaries/{id}/schedule-rules?from=&to=&employeeId=`**: horario de la clínica (`businessHours`), horario por empleado y bloqueos (`blocks`).
2. **Configuración de reservas de la clínica:** `allowOnlineBooking`, `bookingRequiresConfirmation` y `cancellationMinHours`. Por definir si van dentro de `schedule-rules` o en un endpoint aparte.
3. **Permisos de un empleado en una clínica**, sin pasar una mascota. El endpoint `access` actual exige `petId`, así que no sirve para ver la agenda. Hay que confirmar si `/internal/veterinaries/{id}/members/{userId}` ya devuelve los permisos; si no, se agrega. También hay que confirmar que `APPOINTMENT_MANAGE` exista en el mapa de permisos de Veterinary.
4. **Catálogo de servicios:** un endpoint interno para obtener nombre, duración y precio de un `serviceId` (para el snapshot de la cita).
5. **Datos de contacto de la clínica:** `address` y `phone` (hoy `summary` solo devuelve `id`, `name` y `timezone`), necesarios para el payload de los eventos.
6. **Mascota compartida, lado dueño:** el `access` actual está pensado para empleados. Falta definir cómo verifica Calendar que una mascota del dueño está compartida con la clínica.

## Dependencias de otros servicios

- **Pets:** verificar que una mascota pertenece a un dueño. Confirmar el endpoint interno exacto con el responsable de Pets (hoy se sabe de `/internal/pets/batch`).
- **Dueños sin app** (`owner_user_id` nulo): dependen de la Fase 4B de Veterinary y de Pets, que registran mascotas creadas por la clínica.
- **Notifications:** entrega de los eventos, sujeta al sobre común.

---

## Qué se pide a quien implementa Calendar

1. Revisar este documento contra lo que ya existe en su servicio y devolver las **diferencias**.
2. Listar exactamente qué necesita de Veterinary (campos, forma de la respuesta), para definir los contratos de la Fase 5 con requisitos reales.
3. Mientras tanto, puede avanzar con: el modelo, las transiciones, el CRUD de citas, la disponibilidad contra un `schedule-rules` simulado y el job de recordatorios con los eventos detrás del flag.

**Aviso de migración:** el proyecto de Google Cloud actual vence el **18 de noviembre** y los servicios migran a un proyecto nuevo. Si los recordatorios usan Cloud Scheduler, ese job hay que recrearlo en el proyecto nuevo, junto con la rotación de secretos (incluida `INTERNAL_API_KEY`).

---

## Tests mínimos

- Doble reserva del mismo veterinario en la misma franja: rechazada por la base.
- Confirmar una cita sin veterinario asignado: rechazado.
- Disponibilidad respeta horario, bloqueos y citas existentes.
- Dueño cancelando fuera de plazo: error con su `code`.
- Empleado de otra clínica (su `vet_id` no coincide con la ruta): **404**.
- Dueño solicitando cita con una mascota que no es suya o no está compartida con la clínica: rechazado.
- Job de recordatorios ejecutado dos veces: un solo evento por cita.
