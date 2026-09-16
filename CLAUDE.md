# CLAUDE.md

Guía técnica para trabajar en este repo — humano o agente. Ver [README.md](./README.md) para la documentación orientada a usuarios del servicio.

## Qué es esto

Microservicio de calendario (Next.js App Router + Supabase + Google Cloud Pub/Sub) dentro de una malla de microservicios de gestión de mascotas. Su tabla `calendar_events` sirve **dos calendarios distintos** con el mismo esquema: eventos de usuario (`pet_id = null`) y eventos de mascota (`pet_id` presente).

## Arquitectura por capas

```
domain/          → entidades, enums, interfaces. Sin dependencias externas.
application/     → DTOs, casos de uso, servicios. Depende de domain vía interfaces.
infrastructure/  → implementaciones concretas (Supabase, Pub/Sub). Implementa las interfaces de domain.
app/api/         → route handlers de Next.js.
```

**Desviación conocida**: los route handlers en `app/api/calendar-events/**` hablan directo con el cliente de Supabase (no pasan por `ICalendarEventRepository` ni por los use cases). Los use cases (`CreateEventUseCase`, `ListEventsUseCase`, etc.) existen, están completos y testeados, pero **no están conectados a las rutas actuales**. `checkDueReminders.ts` tampoco pasa por el repositorio — hace queries directas a Supabase, siguiendo el mismo patrón que las rutas. Si vas a tocar lógica de negocio, decide si extiendes el patrón existente (queries directas) o si por fin conectas las rutas a los use cases — no mezcles ambos estilos en el mismo archivo.

## Reglas del dominio

- `petId` es **nullable** — su ausencia es la señal de "evento de calendario de usuario", no un dato faltante. Nunca lo trates como error.
- El evento tiene `startDate`/`endDate` (no un único `eventDate`). `startDate` debe ser futura al crear; `endDate` no puede ser anterior a `startDate` (`CreateEventUseCase.validateEventData`, y replicado en las rutas ya que estas no pasan por el use case — ver desviación conocida arriba).
- `location` es opcional (`string | null`), igual que `description`.
- `title` máximo 255 caracteres.
- `EventType` es la *categoría* del evento (`VET_APPOINTMENT`, `MEDICATION`, etc.) — no confundir con `PubSubMessageType`, que es el tipo de evento de **integración** (a nivel de mensaje Pub/Sub).

## Contrato de Pub/Sub — leer antes de tocar nada de `src/infrastructure/pubsub/`

Este servicio es **publisher únicamente** en el topic `calendar-event`. Dos reglas no negociables:

1. **Nunca agregues un subscriber propio a `sub-notification-calendar`.** Esa suscripción pertenece al `notification-microservice`. Pub/Sub reparte los mensajes de una suscripción entre todos sus consumidores (no los duplica) — si este servicio también hace `pull()` ahí, le roba mensajes al consumidor real de forma intermitente. Ya pasó una vez (ver historial de `CalendarEventSubscriber.ts`, eliminado por esta razón).

2. **El envelope del mensaje debe coincidir exactamente con el `DomainEvent` que espera `notification-microservice`** (repo hermano, `notification-microservice-pubsub/src/infrastructure/messaging/pubsub/types.ts`):
   ```ts
   { eventType: string; userId: string; payload?: Record<string, unknown>; occurredAt?: string }
   ```
   El campo que enruta al handler del lado del consumidor es `eventType` a nivel raíz — **no** `type`. Los valores válidos que ese servicio ya reconoce: `CALENDAR_PET_CREATED`, `CALENDAR_USER_CREATED`, `CALENDAR_EVENT_UPDATED`, `CALENDAR_EVENT_REMINDER` (los cuatro ya tienen handler ahí). Si cambias esta forma, hay que actualizar `CalendarEventPayload` y los handlers en ese otro repo en el mismo cambio — Pub/Sub no valida schemas, así que un mismatch falla en silencio.

Antes de modificar `CalendarPubSubService.toPayload()`, revisa `CalendarEventPayload` en ese mismo archivo de tipos del notification-microservice para no romper el contrato. `toPayload()` manda `startDate`/`endDate`/`location` (no `eventDate`) — coincide con `CalendarEventPayload` y con los mensajes de notificación (`withLocation()` en `calendarEvents.handlers.ts` le agrega el lugar al texto cuando viene presente).

## Recordatorios (`checkDueReminders`)

- Máximo **3 intentos** por recordatorio (`MAX_REMINDER_ATTEMPTS` en `src/infrastructure/pubsub/constants.ts`). Al agotarlos, deja de reintentar (no borra el evento, solo dejará de aparecer en el chequeo).
- Requiere dos columnas en Supabase que **no están en ninguna migración versionada** (no hay carpeta de migraciones en este repo — el esquema se gestiona a mano en el dashboard de Supabase):
  ```sql
  ALTER TABLE calendar_events ADD COLUMN reminder_sent boolean NOT NULL DEFAULT false;
  ALTER TABLE calendar_events ADD COLUMN reminder_attempts integer NOT NULL DEFAULT 0;
  ALTER TABLE calendar_events ALTER COLUMN pet_id DROP NOT NULL;

  -- Migración event_date -> start_date/end_date + location (ver commit que introduce startDate/endDate)
  ALTER TABLE calendar_events RENAME COLUMN event_date TO start_date;
  ALTER TABLE calendar_events ADD COLUMN end_date timestamptz;
  UPDATE calendar_events SET end_date = start_date WHERE end_date IS NULL; -- backfill antes del NOT NULL
  ALTER TABLE calendar_events ALTER COLUMN end_date SET NOT NULL;
  ALTER TABLE calendar_events ADD COLUMN location text;
  ```
  Si un entorno nuevo (otro proyecto de Supabase) empieza a fallar con "column does not exist" o el `POST`/`PUT` rechaza eventos sin mascota, es casi seguro que falta correr esto.
- `reminder_sent`/`reminder_attempts` son conceptos de infraestructura (tracking de entrega), **no** viven en la entidad `CalendarEvent` del dominio — no los agregues ahí a menos que el negocio realmente los necesite como concepto de dominio.
- `ENABLE_INTERNAL_REMINDER_CRON` decide si `instrumentation.ts` arranca un `node-cron` en proceso:
  - `true` → Docker/`docker-compose`/`next dev` (proceso persistente, el cron es confiable).
  - `false` u omitido → Cloud Run (puede escalar a cero; usa Cloud Scheduler pegándole a `GET /api/calendar-events/reminders/check` en su lugar).

## Gotchas de entorno/despliegue

- **`.env` vs `.env.local`**: `next dev`/`next build` leen `.env.local`. `docker compose` por defecto solo lee un archivo llamado exactamente `.env` — para que use `.env.local` hay que correr `docker compose --env-file .env.local up`, si no, las variables quedan vacías sin avisar.
- **Política de organización de GCP**: este proyecto tiene `constraints/iam.disableServiceAccountKeyCreation` activa — `gcloud iam service-accounts keys create` falla con `FAILED_PRECONDITION`. Para credenciales locales/Docker, usa el ADC del usuario (`gcloud auth application-default login`, genera `%APPDATA%\gcloud\application_default_credentials.json` en Windows) montado como archivo, no una key de service account.
- **Cloud Run no re-descarga `:latest` con `gcloud run services update`** — ese comando solo cambia config (env vars, etc.) sobre el mismo digest de imagen ya resuelto. Para desplegar una imagen nueva hace falta `gcloud run deploy --image=...`.
- En Cloud Run no hace falta `GOOGLE_APPLICATION_CREDENTIALS` — la identidad viene de la service account asignada al servicio (Application Default Credentials vía metadata server). Ese env var solo aplica a Docker/local.

## Testing

- `jest.config.ts` limita `roots` a `src/` — los route handlers en `app/api/` no tienen tests unitarios (siguiendo el patrón actual del repo).
- Mockea el wrapper local (`../client`), no la librería externa directamente — así lucen los mocks existentes de Supabase (`src/__mocks__/supabase.ts`) y de Pub/Sub (`jest.mock('../client', ...)` en `src/infrastructure/pubsub/test/`).
- Si mockeas una clase inyectada por default-parameter (patrón usado en `checkDueReminders(now, pubSubService = new CalendarPubSubService())`), pásale el mock directo como argumento en el test en vez de usar `jest.mock()` sobre el módulo — evita problemas de hoisting con variables `const` fuera del alcance permitido por `ts-jest`.
- Cobertura mínima configurada: 80% en todas las métricas. Statements/functions/lines ya la superan; branches ronda ~75% — antes de subir el umbral, corre `npm run test:coverage` para confirmar dónde estás parado.

## Comandos

```bash
npm run dev            # servidor de desarrollo
npm run build           # build de producción
npm test                # test suite (Jest)
npm run test:coverage   # con reporte de cobertura
npm run lint             # ESLint
docker compose --env-file .env.local up -d   # levantar en Docker local
```
