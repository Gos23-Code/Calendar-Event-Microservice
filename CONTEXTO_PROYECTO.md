# Contexto del proyecto — Calendar Event Microservice

> Documento de contexto para retomar el proyecto (humano o agente) antes de adaptarlo a **medical**.
> Complementa a [README.md](./README.md) (documentación de usuario) y [CLAUDE.md](./CLAUDE.md) (guía técnica).
> Última revisión: 2026-11-10. Estado verificado: `npx jest` → **10 suites, 81 tests, todos pasan**.

---

## 1. Qué es y para qué existe

Microservicio de **calendario** dentro de una malla de microservicios de gestión de mascotas. Administra eventos en la tabla `calendar_events` y publica cada cambio como evento de **integración** en un topic de **Google Cloud Pub/Sub** (`calendar-event`). El `notification-microservice` (repo hermano) consume esos mensajes y genera notificaciones.

Stack:

- **Next.js 16.3** (App Router) — expone la API REST en `app/api/**`.
- **Supabase (PostgreSQL)** — persistencia, vía `@supabase/supabase-js` con la anon key.
- **Google Cloud Pub/Sub** — publicación de eventos de dominio.
- **node-cron** — cron opcional en proceso para recordatorios.
- **Jest + ts-jest** — tests unitarios (`src/`).

Es un servicio **publisher únicamente**. No consume ningún topic ni suscripción propia.

---

## 2. Dos calendarios en una sola tabla

El mismo esquema sirve para dos vistas, distinguidas por `pet_id`:

| Calendario | Condición | Ejemplo |
|---|---|---|
| **Usuario** (A) | `pet_id IS NULL` | Recordatorio general del dueño |
| **Mascota** (B) | `pet_id` presente | Cita veterinaria de una mascota |

Regla de dominio: **la ausencia de `petId` es una señal válida, nunca un error.**

---

## 3. Arquitectura por capas

```
domain/          → entidades, enums, interfaces. Sin dependencias externas.
application/     → DTOs, casos de uso, servicios. Depende de domain vía interfaces.
infrastructure/  → implementaciones concretas (Supabase, Pub/Sub). Implementa las interfaces de domain.
app/api/         → route handlers de Next.js.
```

### Desviación conocida (importante)

Los route handlers en `app/api/calendar-events/**` **hablan directo con Supabase**. No pasan por `ICalendarEventRepository` ni por los casos de uso.

- Los casos de uso (`CreateEventUseCase`, `ListEventsUseCase`, `UpdateEventUseCase`, `DeleteEventUseCase`) existen, están testeados, pero **no están conectados a las rutas**.
- `checkDueReminders.ts` tampoco usa el repositorio: hace queries directas a Supabase, con el mismo patrón que las rutas.
- Regla del proyecto: no mezclar ambos estilos en el mismo archivo. Decidir si se extiende el patrón de queries directas o si se conectan las rutas a los casos de uso.

### Estructura de carpetas

```
app/
  layout.tsx, page.tsx, globals.css         # boilerplate de create-next-app (sin UI de negocio)
  api/calendar-events/
    route.ts                                 # POST, GET
    [id]/route.ts                            # PUT, DELETE
    reminders/check/route.ts                 # GET — chequeo de recordatorios vencidos
instrumentation.ts                           # arranca el cron interno si ENABLE_INTERNAL_REMINDER_CRON=true

src/
  domain/
    entities/CalendarEvent.ts                # entidad (create, update)
    enums/EventType.ts                       # categoría del evento
    enums/PubSubMessageType.ts               # tipo de mensaje de integración
    interfaces/ICalendarEventRepository.ts
    interfaces/IEventPublisher.ts
  application/
    dtos/CalendarEventDTO.ts
    use-cases/{Create,List,Update,Delete}EventUseCase.ts
    services/CalendarPubSubService.ts        # arma los mensajes (envelope + payload)
  infrastructure/
    database/supabase/
      client.ts                              # createClient con NEXT_PUBLIC_SUPABASE_*
      CalendarEventRepository.ts             # implementación del repo (hoy sin uso desde rutas)
      mappers.ts                             # fila snake_case <-> entidad
    pubsub/
      client.ts                              # new PubSub()
      constants.ts                           # CALENDAR_TOPIC_NAME, MAX_REMINDER_ATTEMPTS
      CalendarEventPublisher.ts              # publica JSON al topic
      checkDueReminders.ts                   # lógica de recordatorios
  shared/utils/validators.ts
  __mocks__/supabase.ts, uuid.ts             # mocks manuales
```

---

## 4. Modelo de datos

### Entidad de dominio `CalendarEvent`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `string` (UUID) | |
| `userId` | `string` (UUID) | Dueño del evento |
| `petId` | `string \| null` | `null` = calendario de usuario |
| `title` | `string` | Máx. 255 caracteres (regla de dominio; ver §10, no se valida en rutas) |
| `description` | `string \| null` | |
| `eventType` | `EventType` | Categoría |
| `startDate` | `Date` | Debe ser futura al crear (regla de dominio; ver §10) |
| `endDate` | `Date` | No puede ser anterior a `startDate` |
| `location` | `string \| null` | Opcional |
| `reminderAt` | `Date \| null` | Momento elegido para el recordatorio |
| `reminderEnabled` | `boolean` | |
| `createdAt`, `updatedAt` | `Date` | |

### Tabla `calendar_events` (Supabase, snake_case)

| Columna | Tipo | Origen |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | |
| `pet_id` | uuid, **nullable** | Migración manual (ver §11) |
| `title` | text | |
| `description` | text, nullable | |
| `event_type` | text | |
| `start_date` | timestamptz | Renombrada desde `event_date` (ver §11) |
| `end_date` | timestamptz, NOT NULL | Añadida (ver §11) |
| `location` | text, nullable | Añadida (ver §11) |
| `reminder_at` | timestamptz, nullable | |
| `reminder_enabled` | boolean | |
| `reminder_sent` | boolean, default `false` | **Infraestructura**, no está en la entidad de dominio |
| `reminder_attempts` | integer, default `0` | **Infraestructura**, no está en la entidad de dominio |
| `created_at`, `updated_at` | timestamptz | |

> El esquema **no está versionado en el repo**: no hay carpeta de migraciones. Se gestiona a mano en el dashboard de Supabase. Si un entorno nuevo falla con "column does not exist", casi seguro falta correr las migraciones de §11.

### `EventType`

`VET_APPOINTMENT` · `MEDICATION` · `TREATMENT` · `GROOMING` · `OTHER`

> `EventType` es la **categoría** del evento. No confundir con `PubSubMessageType`, que es el tipo del mensaje de **integración** en Pub/Sub.

---

## 5. API REST

Base local: `http://localhost:3000/api` (Docker expone `3001`). Cloud Run: `https://<servicio>.run.app/api`.

**No hay autenticación.** El `userId` viaja en el body o en el query y el servicio solo compara strings para validar propiedad (ver §10).

### `POST /calendar-events`

Body:

```json
{
  "userId": "uuid (obligatorio)",
  "petId": "uuid | null (opcional; ausente = calendario de usuario)",
  "title": "string (obligatorio)",
  "description": "string (opcional)",
  "eventType": "VET_APPOINTMENT | MEDICATION | TREATMENT | GROOMING | OTHER (obligatorio)",
  "startDate": "ISO 8601 (obligatorio)",
  "endDate": "ISO 8601 (obligatorio)",
  "location": "string (opcional)",
  "reminderAt": "ISO 8601 (opcional)",
  "reminderEnabled": "boolean (opcional, default false)"
}
```

| Caso | Status | Respuesta |
|---|---|---|
| Creado | `201` | Fila insertada (snake_case) |
| Faltan `title`, `eventType`, `startDate` o `endDate` | `400` | `Missing required fields: ...` |
| `endDate < startDate` | `400` | `End date cannot be before start date` |
| `eventType` inválido | `400` | `Invalid event type` |
| Falta `userId` | `401` | `User ID is required in the body` (el código usa 401, no 400) |
| Error de Supabase | `500` | |

Efecto secundario: publica `CALENDAR_PET_CREATED` (si hay `petId`) o `CALENDAR_USER_CREATED`. Si la publicación falla, **se loguea y la respuesta sigue siendo `201`**.

### `GET /calendar-events`

| Query | Requerido | Efecto |
|---|---|---|
| `userId` | Sí, salvo que se envíe `petId` | Filtra `user_id` |
| `petId` | No | Filtra `pet_id` (tiene prioridad sobre `calendarType`) |
| `calendarType` | No | `user` → `pet_id IS NULL` · `pet` → `pet_id IS NOT NULL` |

- Sin `userId` ni `petId` → `401`.
- Orden: `start_date` ascendente.
- Respuesta: `{ "events": [...], "user_id": ..., "pet_id": ... }`.

### `PUT /calendar-events/:id`

Body: `userId` (obligatorio) + cualquiera de `petId`, `title`, `description`, `eventType`, `startDate`, `endDate`, `location`, `reminderAt`, `reminderEnabled`.

| Caso | Status |
|---|---|
| Falta `userId` en body | `401` |
| Evento no existe | `404` |
| `userId` no es el dueño | `403` |
| `eventType` inválido | `400` |
| Fechas inconsistentes (valida contra la fecha existente si solo envías una) | `400` |
| Sin campos para actualizar | `400` (`No fields to update`) |
| OK | `200` con la fila actualizada |

- Si cambia `reminderAt` o `reminderEnabled`, se fuerza `reminder_sent = false` para que el cron pueda volver a notificar.
- Publica `CALENDAR_EVENT_UPDATED`. Si falla, igual responde `200`.

### `DELETE /calendar-events/:id?userId=`

| Caso | Status |
|---|---|
| Falta `userId` en query | `401` |
| No existe | `404` |
| No es el dueño | `403` |
| OK | `200` `{ success, message, id }` |

No publica ningún evento de Pub/Sub.

### `GET /calendar-events/reminders/check`

Revisa recordatorios vencidos y los publica. Pensado para Cloud Scheduler o para el cron interno. Respuesta: `{ checked, notified: [ids], failed: [{ id, error, attempts, giveUp }] }`.

---

## 6. Contrato Pub/Sub (leer antes de tocar `src/infrastructure/pubsub/`)

### Reglas no negociables

1. **Nunca agregar un subscriber propio a `sub-notification-calendar`.** Esa suscripción pertenece al `notification-microservice`. Pub/Sub reparte los mensajes entre consumidores; si este servicio también hace `pull()`, le roba mensajes de forma intermitente. Ya pasó: el `CalendarEventSubscriber.ts` fue eliminado por esta razón. `instrumentation.ts` lo documenta.
2. **El envelope debe coincidir con el `DomainEvent` del notification-microservice** (`notification-microservice-pubsub/src/infrastructure/messaging/pubsub/types.ts`):

   ```ts
   { eventType: string; userId: string; payload?: Record<string, unknown>; occurredAt?: string }
   ```

   El campo que enruta el handler del lado consumidor es **`eventType` a nivel raíz**, no `type`. Pub/Sub no valida schemas: un mismatch falla **en silencio**. Si cambias la forma, actualiza `CalendarEventPayload` y los handlers en ese otro repo en el mismo cambio.

### Tipos de mensaje

| `eventType` (raíz) | Cuándo | Método |
|---|---|---|
| `CALENDAR_PET_CREATED` | Se crea evento con `petId` | `publishEventCreated` |
| `CALENDAR_USER_CREATED` | Se crea evento sin `petId` | `publishEventCreated` |
| `CALENDAR_EVENT_UPDATED` | Se actualiza un evento | `publishEventUpdated` |
| `CALENDAR_EVENT_REMINDER` | Vence un recordatorio | `publishReminderDue` |

Los cuatro ya tienen handler en el notification-microservice.

### Payload (`CalendarPubSubService.toPayload`)

```json
{
  "eventType": "CALENDAR_PET_CREATED",
  "userId": "uuid",
  "payload": {
    "eventId": "uuid",
    "petId": "uuid | undefined",
    "userId": "uuid",
    "title": "string",
    "description": "string | undefined",
    "eventType": "VET_APPOINTMENT",
    "startDate": "ISO",
    "endDate": "ISO",
    "location": "string | undefined",
    "reminderAt": "ISO | undefined",
    "reminderEnabled": true
  },
  "occurredAt": "ISO"
}
```

- Se envía `startDate`/`endDate`/`location`, **no** `eventDate`. Coincide con `CalendarEventPayload` y con `withLocation()` en `calendarEvents.handlers.ts` del notification-microservice.
- Antes de cambiar `toPayload()`, revisar `CalendarEventPayload` en ese repo.

### Publicación

`CalendarEventPublisher.publish` serializa el mensaje a JSON y lo publica en `CALENDAR_TOPIC_NAME` (`PUBSUB_CALENDAR_TOPIC`, default `calendar`), con el atributo `eventType` duplicado.

---

## 7. Recordatorios

- Cada evento tiene su `reminderAt` libre (lo elige el usuario).
- `checkDueReminders` busca filas con `reminder_enabled = true`, `reminder_sent = false`, `reminder_attempts < 3` y `reminder_at <= now`.
- Por cada fila: publica `CALENDAR_EVENT_REMINDER`, marca `reminder_sent = true`. Si falla, incrementa `reminder_attempts`.
- `MAX_REMINDER_ATTEMPTS = 3` (en `src/infrastructure/pubsub/constants.ts`). Al agotarlos deja de aparecer en el chequeo; **no borra el evento**.
- El chequeo puede dispararse de dos formas, según `ENABLE_INTERNAL_REMINDER_CRON`:

| Entorno | Valor | Mecanismo |
|---|---|---|
| Docker / docker-compose | `true` | `node-cron` en proceso, cada minuto (`instrumentation.ts`) |
| `next dev` | `true` (recomendado) | Igual |
| Cloud Run | `false` u omitido | Cloud Scheduler → `GET /api/calendar-events/reminders/check` |

Motivo: Cloud Run puede escalar a cero, y un `setInterval` no es confiable ahí.

---

## 8. Historial relevante (git)

| Commit | Qué introdujo |
|---|---|
| `fa86f27` | Initial commit (create-next-app) |
| `6d81653` | Clean Architecture base: entidades, repositorio Supabase, caso de uso de creación |
| `1474304` | Listado de eventos por userId |
| `fda9b15` | Actualización de eventos |
| `741e7fb` | Eliminación de eventos |
| `eea9eea` | Entidades y tests, repo Supabase, `EventType`, creación/listado/update/delete |
| `c5c28b9` | Docker + ajustes de `next.config` |
| `b1b8c39` | Ajustes de api, package, tsconfig, next-env |
| `68d6cb3` | Casos de uso de creación y listado separados para calendario de usuario vs mascota |
| `d58f1c2`, `bcd7d17` | Documentación de campos en README |
| `b1db01f` | `startDate`/`endDate` (reemplaza `eventDate`) y `location` |
| `093ad98` | Merge a `main` (rama actual) |

Hitos de comportamiento que no se ven en el código:
- Pub/Sub se usa solo como **publisher**; el consumo lo hace otro servicio.
- El cron interno y Cloud Scheduler son mutuamente excluyentes (`ENABLE_INTERNAL_REMINDER_CRON`).

---

## 9. Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Build + runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Build + runtime |
| `GOOGLE_CLOUD_PROJECT` | Sí | Pub/Sub |
| `PUBSUB_CALENDAR_TOPIC` | No (default `calendar`; docker-compose usa `calendar-event`) | Nombre del topic |
| `ENABLE_INTERNAL_REMINDER_CRON` | No (default deshabilitado) | `true` activa el cron en proceso |
| `GOOGLE_APPLICATION_CREDENTIALS` | Solo Docker/local | Ruta al JSON de credenciales dentro del contenedor |

Notas de entorno:

- `next dev` y `next build` leen **`.env.local`**.
- `docker compose` por defecto solo lee **`.env`**. Para usar `.env.local`: `docker compose --env-file .env.local up -d`. Si no, las variables quedan vacías sin avisar.
- **Política de la organización GCP**: `constraints/iam.disableServiceAccountKeyCreation` está activa. `gcloud iam service-accounts keys create` falla con `FAILED_PRECONDITION`. Para local/Docker usar ADC del usuario (`gcloud auth application-default login`, genera `%APPDATA%\gcloud\application_default_credentials.json` en Windows) montado como archivo.
- En Cloud Run no hace falta `GOOGLE_APPLICATION_CREDENTIALS`: la identidad viene de la service account del servicio (ADC vía metadata server).

---

## 10. Puntos débiles y decisiones pendientes

Observaciones de la revisión del código. Ninguna está resuelta.

### Seguridad (crítico para datos médicos)

- **Sin autenticación.** Cualquiera que conozca un `userId` puede listar, crear, editar o borrar sus eventos. La "validación de propiedad" es comparar el `userId` que manda el cliente.
- **Anon key de Supabase usada en el servidor.** No hay evidencia en el repo de RLS configurado; si la tabla tiene RLS, las queries con anon key están limitadas por ella, pero sin sesión de usuario no se puede aprovechar RLS por usuario.
- **Ids en URL y query** (`userId`, `petId`) sin verificación de identidad. `GET` con solo `petId` no verifica dueño.

### Validaciones inconsistentes con las reglas de CLAUDE.md

- `startDate` futura al crear: regla de dominio, **no se valida** en `POST`.
- `title` máximo 255: **no se valida** en rutas.
- Los casos de uso sí validan, pero no están conectados.

### Lógica de recordatorios

- `PUT` que cambia `reminderAt` resetea `reminder_sent` pero **no** `reminder_attempts`. Un evento que agotó sus 3 intentos no volverá a dispararse aunque se reprograme. Probablemente debe resetearse también `reminder_attempts`.
- En `checkDueReminders`, si el `update` de `reminder_sent` falla **después** de publicar, el siguiente ciclo republica el recordatorio (duplicado posible). Y el `update` de `reminder_attempts` en el `catch` no revisa su error.

### Publicación

- Fallos al publicar en Pub/Sub en `POST`/`PUT` se loguean y **la API responde éxito**. Si el notification-microservice no recibe el mensaje, no hay forma de enterarse desde aquí. No hay outbox ni reintento.

### Despliegue

- `docker-compose.yml` referencia `Dockerfile`, pero el archivo en el repo se llama `dockerfile` (minúscula). En Windows funciona (sistema de archivos sin distinción de mayúsculas), pero en un build Linux/CI puede fallar.
- Esquema de la BD fuera del repo (ver §11).

### Tests

- Las rutas de `app/api/**` no tienen tests (`jest.config.ts` limita `roots` a `src/`).
- Cobertura mínima configurada: 80%. Statements/functions/lines lo superan; branches ronda 75%.

---

## 11. Migraciones manuales de Supabase

No están versionadas. Un entorno nuevo debe tenerlas todas:

```sql
ALTER TABLE calendar_events ADD COLUMN reminder_sent boolean NOT NULL DEFAULT false;
ALTER TABLE calendar_events ADD COLUMN reminder_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE calendar_events ALTER COLUMN pet_id DROP NOT NULL;

-- Migración event_date -> start_date/end_date + location
ALTER TABLE calendar_events RENAME COLUMN event_date TO start_date;
ALTER TABLE calendar_events ADD COLUMN end_date timestamptz;
UPDATE calendar_events SET end_date = start_date WHERE end_date IS NULL;
ALTER TABLE calendar_events ALTER COLUMN end_date SET NOT NULL;
ALTER TABLE calendar_events ADD COLUMN location text;
```

Síntomas si faltan: `column does not exist`, o `POST`/`PUT` rechazan eventos sin mascota.

---

## 12. Comandos

```bash
npm install
npm run dev              # next dev (puerto 3000)
npm run build            # build de producción
npm test                 # Jest (81 tests)
npm run test:coverage    # con cobertura
npm run lint             # ESLint

docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... -t calendar-microservice .
docker compose --env-file .env.local up -d
```

Despliegue en Cloud Run (imagen nueva):

```bash
gcloud run deploy calendar-microservice --image=docker.io/<usuario>/calendar-microservice:latest --region=us-central1 \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=<project>,PUBSUB_CALENDAR_TOPIC=calendar-event,ENABLE_INTERNAL_REMINDER_CRON=false
```

> `gcloud run services update` **no** vuelve a descargar `:latest`; solo cambia configuración sobre el digest ya resuelto.

Scheduler de recordatorios:

```bash
gcloud scheduler jobs create http calendar-reminders-check --schedule="* * * * *" \
  --uri="https://<servicio>.run.app/api/calendar-events/reminders/check" --http-method=GET --location=us-central1
```

---

## 13. Convenciones para cambios

- Si tocas lógica de negocio, decide: extender queries directas o conectar las rutas a los casos de uso. No mezclar en el mismo archivo.
- Mockear el wrapper local (`../client`), no la librería externa. Ver `src/__mocks__/supabase.ts` y `src/infrastructure/pubsub/test/`.
- Para clases inyectadas por default-parameter (`checkDueReminders(now, pubSubService = new CalendarPubSubService())`), pasar el mock como argumento en el test en lugar de `jest.mock()`.
- `reminder_sent` / `reminder_attempts` son de infraestructura. No agregarlos a `CalendarEvent` salvo que el negocio los necesite como concepto de dominio.
- Antes de subir el umbral de cobertura, correr `npm run test:coverage`.

---

## 14. Para la adaptación a medical

Puntos que el cambio a dominio médico toca directamente:

1. **Datos sensibles**: los eventos médicos son información de salud. Antes de cualquier uso real, resolver autenticación y autorización (§10), RLS en Supabase y el manejo de logs (hoy se loguea `userId` en cada request).
2. **Nuevos `EventType`**: el enum actual es veterinario (`VET_APPOINTMENT`, `MEDICATION`, `TREATMENT`, `GROOMING`, `OTHER`). Ampliarlo implica tocar el enum, la validación de rutas y el contrato con el notification-microservice.
3. **Mensajes Pub/Sub**: el topic es `calendar-event`. Cualquier nuevo `eventType` debe tener handler en el consumidor, o se pierde en silencio.
4. **Concepto de "mascota"**: `petId` es el ancla del calendario B. Para medical puede ser otro sujeto (paciente, profesional). Decidir si se renombra o se generaliza, antes de tocar la API pública.
5. **Esquema**: aplicar primero las migraciones de §11 en el nuevo entorno, y considerar versionarlas en el repo.
6. **Pendiente de decisión**: conectar las rutas a los casos de uso (hoy no están conectados). Hacerlo antes de agregar reglas médicas evita duplicar validaciones en dos lugares.
