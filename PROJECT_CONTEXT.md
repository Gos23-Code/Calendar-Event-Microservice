# PROJECT_CONTEXT — Calendar Event Microservice

Documento de contexto completo del proyecto: qué es, cómo está construido, qué se ha hecho (historia de commits), qué está pendiente y qué inconsistencias conviene conocer. Complementa a [README.md](./README.md) (documentación de uso) y [CLAUDE.md](./CLAUDE.md) (guía técnica para agentes/humanos).

> Este archivo no contiene secretos. Las variables de entorno aparecen solo por nombre.

---

## 1. Resumen ejecutivo

- **Qué es:** un microservicio de calendario dentro de una malla de microservicios de gestión de mascotas.
- **Qué hace:** CRUD de eventos de calendario en dos vistas que comparten tabla:
  - **Calendario de usuario** (`pet_id = null`): recordatorios generales.
  - **Calendario de mascota** (`pet_id` presente): citas veterinarias, medicamentos, tratamientos, peluquería, etc.
- **Rol en la malla:** **publisher únicamente** del topic de Google Cloud Pub/Sub `calendar-event`. El `notification-microservice` (repo hermano) es el consumidor real.
- **Recordatorios:** un chequeo periódico publica eventos `CALENDAR_EVENT_REMINDER` cuando vence el `reminderAt` de un evento.
- **Stack:** Next.js 16 (App Router) · TypeScript · Supabase (PostgreSQL) · `@google-cloud/pubsub` · `node-cron` · Jest 30 · Docker · Cloud Run.
- **Estado:** funcional para el flujo de API + Pub/Sub. Las capas de dominio/aplicación (use cases) están completas y testeadas, pero **las rutas HTTP no las usan** (ver §6 y §11).

---

## 2. Historia del proyecto (qué se ha hecho)

Repositorio: `Gos23-Code/Calendar-Event-Microservice`. Rama actual local: `main`. `origin/HEAD` apunta a `feature/Create_Event_Calendar`.

| Fecha | Commit | Qué introdujo |
|---|---|---|
| 2026-06-24 | `fa86f27` | Initial commit (create-next-app) |
| 2026-06-25 | `6d81653` | Arquitectura por capas (Clean Architecture), entidad `CalendarEvent`, repositorio Supabase y caso de uso de creación |
| 2026-06-25 | `1474304` | Listado de eventos por `userId` |
| 2026-06-25 | `fda9b15` | Actualización de eventos |
| 2026-06-25 | `741e7fb` | Eliminación de eventos |
| 2026-07-16 | `eea9eea` | Consolidación: entidades, tests, repositorio, `EventType`, creación/listado/actualización/eliminación |
| 2026-08-22 | `c5c28b9` | Configuración Docker (`dockerfile` multi-stage, `docker-compose.yml`), `next.config` con `output: standalone` |
| 2026-08-22 | `b1b8c39` | Ajustes de `api`, `package`, `tsconfig`, `next-env` |
| 2026-09-11 | `68d6cb3` | Separación de casos de uso de **calendario de usuario** vs **calendario de mascota** (`petId` nullable, filtros `withPet`, `calendarType`) |
| 2026-09-15 | `d58f1c2`, `bcd7d17` | Documentación README (campos del evento) |
| 2026-09-15 | `b1db01f` | **Cambio grande**: `startDate`/`endDate` reemplazan `eventDate`; campo `location`; integración Pub/Sub (`CalendarPubSubService`, `CalendarEventPublisher`); recordatorios (`checkDueReminders`, `reminder_sent`, `reminder_attempts`); `instrumentation.ts` con cron opcional; endpoint `GET /reminders/check`; 32 archivos, +2028 / −163 |
| 2026-09-15 | `093ad98` | Merge de `main` (estado actual) |

### Ramas

| Rama | Estado |
|---|---|
| `main` (local) | Rama de trabajo actual, limpia |
| `origin/main` | Hasta el merge `093ad98` |
| `feature/Create_Event_Calendar` | Commit extra `a54d4b4` ("creation of files and entity tests...") no presente en `main` |
| `feature/Delete_Event_Calendar` | Sin commits propios adicionales |
| `feature/List_Event_Calendar` / `feature/Update_Event_Calendar` | Solo remotas, sin cambios nuevos respecto a `main` |

### Historial de decisiones relevantes

- **Eliminado el subscriber propio** (`CalendarEventSubscriber.ts`): este servicio **no** debe hacer `pull()` de `sub-notification-calendar`, porque Pub/Sub reparte mensajes entre consumidores y le robaría mensajes al notification-microservice. Está documentado en `instrumentation.ts` y en CLAUDE.md.
- **Un solo modelo para dos calendarios**: en lugar de dos tablas, `pet_id` nullable distingue el tipo de evento.
- **Cron en proceso vs Cloud Scheduler**: el cron de `node-cron` solo es confiable en un contenedor persistente. En Cloud Run (escala a cero) se usa Cloud Scheduler contra `GET /api/calendar-events/reminders/check`.

---

## 3. Arquitectura

```
app/api/            → Route handlers de Next.js (HTTP)
src/domain/         → entidades, enums, interfaces (sin dependencias externas)
src/application/    → DTOs, casos de uso, servicio de Pub/Sub
src/infrastructure/ → Supabase, Pub/Sub, cron de recordatorios
src/shared/         → utilidades (validators.ts, vacío hoy)
instrumentation.ts  → arranque del cron interno (solo si ENABLE_INTERNAL_REMINDER_CRON=true)
```

### Desviación conocida (importante)

Los route handlers en `app/api/calendar-events/**` hablan **directo con el cliente de Supabase**. No pasan por `ICalendarEventRepository` ni por los use cases (`CreateEventUseCase`, `ListEventsUseCase`, `UpdateEventUseCase`, `DeleteEventUseCase`), que existen, están completos y testeados, pero **no están conectados**.

`checkDueReminders.ts` tampoco pasa por el repositorio: también hace queries directas, siguiendo el mismo patrón.

Decisión pendiente: o se extiende el patrón de queries directas, o se conectan las rutas a los use cases. **No mezclar ambos estilos en el mismo archivo.**

### Mapa de archivos clave

| Archivo | Responsabilidad |
|---|---|
| `app/api/calendar-events/route.ts` | `POST` crear, `GET` listar |
| `app/api/calendar-events/[id]/route.ts` | `PUT` actualizar, `DELETE` eliminar |
| `app/api/calendar-events/reminders/check/route.ts` | `GET` disparar chequeo de recordatorios |
| `instrumentation.ts` | Cron `* * * * *` opcional |
| `src/domain/entities/CalendarEvent.ts` | Entidad con `create()` y `update()` |
| `src/domain/enums/EventType.ts` | Categoría del evento |
| `src/domain/enums/PubSubMessageType.ts` | Tipos de mensaje de integración (`eventType` raíz) |
| `src/domain/interfaces/IEventPublisher.ts` | Forma del `CalendarEventMessage` |
| `src/domain/interfaces/ICalendarEventRepository.ts` | Contrato del repositorio |
| `src/application/use-cases/*.ts` | Create / List / Update / Delete (no conectados a rutas) |
| `src/application/services/CalendarPubSubService.ts` | Construye mensajes: `publishEventCreated`, `publishEventUpdated`, `publishReminderDue`, `toPayload()` |
| `src/application/dtos/CalendarEventDTO.ts` | DTOs de creación, actualización y filtros |
| `src/infrastructure/database/supabase/client.ts` | Cliente Supabase (anon key) |
| `src/infrastructure/database/supabase/CalendarEventRepository.ts` | Repositorio (implementa la interfaz, no usado por rutas) |
| `src/infrastructure/database/supabase/mappers.ts` | Fila Supabase → `CalendarEvent` |
| `src/infrastructure/pubsub/client.ts` | `new PubSub()` |
| `src/infrastructure/pubsub/constants.ts` | Nombre del topic y `MAX_REMINDER_ATTEMPTS = 3` |
| `src/infrastructure/pubsub/CalendarEventPublisher.ts` | Publica JSON con atributo `eventType` |
| `src/infrastructure/pubsub/checkDueReminders.ts` | Lógica de recordatorios vencidos |

---

## 4. Modelo de dominio

### Entidad `CalendarEvent`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | Generado por Supabase en rutas; `crypto.randomUUID()` en `CalendarEvent.create()` |
| `userId` | UUID | Dueño del evento |
| `petId` | `string \| null` | **`null` = calendario de usuario**. Nunca es un error. |
| `title` | string | Máx. 255 caracteres |
| `description` | `string \| null` | Opcional |
| `eventType` | `EventType` | Categoría |
| `startDate` | Date | Debe ser futura al crear (validado en use case, **no** en la ruta) |
| `endDate` | Date | No puede ser anterior a `startDate` |
| `location` | `string \| null` | Opcional |
| `reminderAt` | `Date \| null` | Momento exacto del recordatorio |
| `reminderEnabled` | boolean | Si el recordatorio está activo |
| `createdAt` / `updatedAt` | Date | Timestamps |

### `EventType` (categoría)

`VET_APPOINTMENT · MEDICATION · TREATMENT · GROOMING · OTHER`

> No confundir `EventType` (categoría del evento) con `PubSubMessageType` (tipo de mensaje de integración en Pub/Sub).

### Tipos de mensaje Pub/Sub (`PubSubMessageType`)

`CALENDAR_PET_CREATED · CALENDAR_USER_CREATED · CALENDAR_EVENT_UPDATED · CALENDAR_EVENT_REMINDER`

---

## 5. Esquema de base de datos (Supabase)

Tabla: `calendar_events`. **No hay carpeta de migraciones versionada**: el esquema se gestiona a mano en el dashboard de Supabase. Columnas que el código espera:

| Columna | Tipo sugerido | Origen |
|---|---|---|
| `id` | uuid (PK, default) | base |
| `user_id` | uuid | base |
| `pet_id` | uuid, **nullable** | base; `DROP NOT NULL` requerido |
| `title` | text / varchar(255) | base |
| `description` | text, nullable | base |
| `event_type` | text | base |
| `start_date` | timestamptz | renombrada desde `event_date` |
| `end_date` | timestamptz, NOT NULL | nueva |
| `location` | text, nullable | nueva |
| `reminder_at` | timestamptz, nullable | base |
| `reminder_enabled` | boolean | base |
| `reminder_sent` | boolean NOT NULL DEFAULT false | recordatorios |
| `reminder_attempts` | integer NOT NULL DEFAULT 0 | recordatorios |
| `created_at` / `updated_at` | timestamptz | base |

### SQL de migración requerido (de CLAUDE.md)

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

> Si un entorno nuevo (otro proyecto de Supabase) falla con "column does not exist" o rechaza eventos sin mascota, casi seguro falta correr este SQL.

---

## 6. API REST

Base local: `http://localhost:3000/api` (`npm run dev`) · Docker: `http://localhost:3001/api` (mapeo `3001:3000`).

| Método | Ruta | Descripción | Éxito | Errores principales |
|---|---|---|---|---|
| POST | `/calendar-events` | Crea evento. Sin `petId` → calendario de usuario | `201` + registro | `400` campos faltantes / fin < inicio / tipo inválido; `401` sin `userId`; `500` |
| GET | `/calendar-events?userId=&petId=&calendarType=` | Lista eventos ordenados por `start_date` | `200` `{events, user_id, pet_id}` | `401` si faltan `userId` y `petId` |
| PUT | `/calendar-events/:id` | Actualiza campos. Requiere `userId` en body | `200` registro | `401` sin `userId`; `404` no existe; `403` no es dueño; `400` tipo inválido / fin < inicio / sin campos; `500` |
| DELETE | `/calendar-events/:id?userId=` | Elimina evento con validación de dueño | `200` `{success, message, id}` | `401` sin `userId`; `404`; `403`; `500` |
| GET | `/calendar-events/reminders/check` | Busca recordatorios vencidos, publica y marca | `200` `{checked, notified[], failed[]}` | `500` |

### Parámetros de listado

| Query | Efecto |
|---|---|
| `userId` | Filtra por dueño |
| `petId` | Filtra por mascota (tiene prioridad sobre `calendarType`) |
| `calendarType=user` | Solo `pet_id IS NULL` |
| `calendarType=pet` | Solo `pet_id IS NOT NULL` |

### Body de creación (ejemplo)

```json
{
  "userId": "uuid",
  "petId": "uuid (opcional; omitir para calendario de usuario)",
  "title": "Vacuna anual",
  "description": "Llevar carnet",
  "eventType": "VET_APPOINTMENT",
  "startDate": "2026-12-15T10:00:00.000Z",
  "endDate": "2026-12-15T11:00:00.000Z",
  "location": "Clínica Central",
  "reminderAt": "2026-12-14T10:00:00.000Z",
  "reminderEnabled": true
}
```

### Comportamiento de PUT relevante

- Si cambia `reminderAt` o `reminderEnabled`, se pone `reminder_sent = false` para permitir que el recordatorio vuelva a dispararse.
- **No** reinicia `reminder_attempts` (ver §11).
- Publica `CALENDAR_EVENT_UPDATED` (sin `try` que bloquee la respuesta si Pub/Sub falla: el error solo se loguea).

---

## 7. Contrato de Pub/Sub — NO negociable

Este servicio es **publisher** en el topic `calendar-event` (default en código: `calendar`, configurable con `PUBSUB_CALENDAR_TOPIC`).

### Reglas

1. **Nunca** agregar un subscriber propio a `sub-notification-calendar` (pertenece al notification-microservice).
2. El **envelope** debe coincidir exactamente con el `DomainEvent` del notification-microservice (`notification-microservice-pubsub/src/infrastructure/messaging/pubsub/types.ts`):

```ts
{ eventType: string; userId: string; payload?: Record<string, unknown>; occurredAt?: string }
```

El campo que enruta es `eventType` **a nivel raíz** (no `type`). Pub/Sub no valida schemas: un mismatch falla en silencio.

### Mensaje publicado

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

Además se envía el atributo de mensaje `eventType` (`CalendarEventPublisher`).

### Tabla de eventos

| `eventType` | Cuándo |
|---|---|
| `CALENDAR_PET_CREATED` | Se crea un evento con `petId` |
| `CALENDAR_USER_CREATED` | Se crea un evento sin `petId` |
| `CALENDAR_EVENT_UPDATED` | Se actualiza cualquier evento |
| `CALENDAR_EVENT_REMINDER` | Vence el recordatorio (lo dispara `checkDueReminders`) |

Los cuatro ya tienen handler en el notification-microservice (`calendarEvents.handlers.ts`). `withLocation()` agrega el lugar al texto cuando viene presente.

> Si se cambia la forma del mensaje, actualizar **en el mismo cambio** `CalendarEventPayload` y los handlers en el repo del notification-microservice.

---

## 8. Recordatorios

- Cada evento tiene su `reminderAt` (elegido por el usuario).
- `checkDueReminders(now, pubSubService)` busca filas con `reminder_enabled = true`, `reminder_sent = false`, `reminder_attempts < 3` y `reminder_at <= now`.
- Por cada fila: publica `CALENDAR_EVENT_REMINDER`, marca `reminder_sent = true`. Si falla, incrementa `reminder_attempts`.
- Máximo **3 intentos** (`MAX_REMINDER_ATTEMPTS`). Al agotarlos deja de aparecer; **no borra** el evento.
- Devuelve `{ checked, notified, failed[] }` con `giveUp` por cada fallo.

### Cómo se dispara

| Variable `ENABLE_INTERNAL_REMINDER_CRON` | Entorno | Mecanismo |
|---|---|---|
| `true` | Docker / `docker-compose` / `next dev` | `node-cron` cada minuto dentro del proceso (`instrumentation.ts`) |
| `false` u omitida | Cloud Run | Cloud Scheduler → `GET /api/calendar-events/reminders/check` cada minuto |

`reminder_sent` y `reminder_attempts` son conceptos de **infraestructura** (tracking de entrega), no viven en la entidad de dominio.

---

## 9. Variables de entorno

| Variable | Requerida | Uso | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Build + runtime | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Build + runtime | Anon key (es pública por diseño en `NEXT_PUBLIC_*`) |
| `GOOGLE_CLOUD_PROJECT` | Sí | Runtime | Project ID de GCP |
| `PUBSUB_CALENDAR_TOPIC` | No (default `calendar`) | Runtime | Debe ser `calendar-event` en la práctica |
| `ENABLE_INTERNAL_REMINDER_CRON` | No | Runtime | `true` solo en contenedor persistente |
| `GOOGLE_APPLICATION_CREDENTIALS` | Solo Docker/local | Runtime | Ruta a credencial dentro del contenedor |
| `GCP_KEY_FILE_PATH` | Solo docker-compose | Compose | Ruta local del archivo de credencial que se monta |

### Gotchas de entorno

- **`.env` vs `.env.local`**: `next dev`/`next build` leen `.env.local`. `docker compose` solo lee `.env` por defecto. Usar `docker compose --env-file .env.local up -d`; si no, las variables quedan vacías sin aviso.
- **GCP sin llaves de service account**: la organización tiene `constraints/iam.disableServiceAccountKeyCreation` activa; `gcloud iam service-accounts keys create` falla con `FAILED_PRECONDITION`. Para local/Docker usar ADC del usuario: `gcloud auth application-default login` (en Windows genera `%APPDATA%\gcloud\application_default_credentials.json`) y montarlo como archivo.
- **Cloud Run**: no necesita `GOOGLE_APPLICATION_CREDENTIALS`; usa la service account asignada (rol `roles/pubsub.publisher`).
- **Cloud Run y `:latest`**: `gcloud run services update` no re-descarga la imagen. Para desplegar una imagen nueva: `gcloud run deploy --image=...`.

---

## 10. Testing

- Framework: **Jest 30 + ts-jest**. `roots: ['<rootDir>/src']` → las rutas en `app/api/` **no tienen tests unitarios**.
- **81 tests** (conteo de `it(`/`test(` en `src/`).
- Cobertura mínima configurada: **80%** en statements, branches, functions y lines. Statements/functions/lines superan el umbral; branches ronda ~75% (ver `npm run test:coverage` antes de subir umbrales).
- Mocks:
  - `src/__mocks__/supabase.ts` (cadena de métodos de Supabase con `mockReturnThis`).
  - `src/__mocks__/uuid.ts`.
  - Pub/Sub: `jest.mock('../client', ...)` en `src/infrastructure/pubsub/test/`.
- Convención: mockear el **wrapper local** (`../client`), no la librería externa.
- Para clases inyectadas por default-parameter (`checkDueReminders(now, pubSubService = new CalendarPubSubService())`), pasar el mock como argumento en el test en vez de `jest.mock()` (evita problemas de hoisting con `ts-jest`).

Suites:

| Carpeta | Qué cubre |
|---|---|
| `src/domain/entities/test/` | `CalendarEvent` |
| `src/domain/enums/test/` | `EventType` |
| `src/application/use-cases/test/` | Create / List / Update / Delete |
| `src/application/services/test/` | `CalendarPubSubService` |
| `src/infrastructure/database/supabase/test/` | `CalendarEventRepository` |
| `src/infrastructure/pubsub/test/` | `CalendarEventPublisher`, `checkDueReminders` |

---

## 11. Problemas conocidos e inconsistencias

Detectados al revisar el código. Ordenados aproximadamente por impacto.

1. **Reintentos de recordatorio no se reinician al reprogramar.** `PUT` pone `reminder_sent = false` cuando cambia `reminderAt`, pero **no** resetea `reminder_attempts`. Un recordatorio que ya falló 2 veces, al reprogramarse, tendrá un solo intento.
2. **Validación de fecha futura solo en el use case.** `CreateEventUseCase` rechaza `startDate` en el pasado, pero la ruta `POST` no lo valida (solo `endDate < startDate`). CLAUDE.md dice que la validación está "replicada en las rutas", y eso no es exacto para la fecha futura. `PUT` tampoco valida fecha futura.
3. **Rutas no usan los use cases.** Duplica lógica de validación (ver desviación en §3). Riesgo de divergencia.
4. **Posible duplicado de recordatorio.** En `checkDueReminders`, si `publishReminderDue` tiene éxito pero el `update` de `reminder_sent` falla, la fila se cuenta como fallo, incrementa `reminder_attempts` y en el siguiente ciclo se vuelve a publicar.
5. **Error ignorado al incrementar intentos.** En `checkDueReminders`, el `update` de `reminder_attempts` no revisa su `error`.
6. **Códigos HTTP.** Falta de `userId` devuelve `401` (en `GET` y `POST`). Semánticamente sería `400`, o `401` solo si hubiera autenticación real.
7. **Sin autenticación real.** `userId` viene del body/query y no se verifica contra un token. La protección depende del gateway/cliente. La anon key de Supabase va en el servidor sin RLS documentada aquí.
8. **`PUT` permite cambiar `petId` sin validar.** No comprueba que la mascota pertenezca al usuario.
9. **Nombre de topic por defecto distinto.** El código usa `calendar` si falta `PUBSUB_CALENDAR_TOPIC`; CLAUDE.md y el contrato hablan de `calendar-event`. Conviene fijarlo siempre en el entorno.
10. **`dockerfile` en minúscula vs `Dockerfile` en `docker-compose.yml`.** Funciona en Windows (case-insensitive), pero fallará en Linux/CI case-sensitive.
11. **`docker-compose.yml` usa red externa** `microservicios-net`: debe existir antes de levantar.
12. **Migraciones fuera del repo.** El esquema vive solo en el dashboard de Supabase; no hay forma de reproducir el estado de la base desde git (ver §5).
13. **Cobertura en README sin verificar.** Dice ~91% de statements; el conteo de tests (81) coincide, pero el porcentaje no se revisó en esta sesión. Confirmar con `npm run test:coverage`.

---

## 12. Cómo correr el proyecto

### Local (sin Docker)

```bash
npm install
# crear .env.local con las variables de §9
gcloud auth application-default login
npm run dev            # http://localhost:3000
```

### Docker local

```bash
docker network create microservicios-net   # si no existe
docker compose --env-file .env.local up -d # http://localhost:3001
```

### Build y calidad

```bash
npm run build
npm test
npm run test:coverage
npm run lint
```

### Despliegue en Cloud Run

```bash
gcloud run deploy calendar-microservice \
  --image=docker.io/<usuario>/calendar-microservice:latest \
  --region=us-central1 \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=<project-id>,PUBSUB_CALENDAR_TOPIC=calendar-event,ENABLE_INTERNAL_REMINDER_CRON=false

gcloud scheduler jobs create http calendar-reminders-check \
  --schedule="* * * * *" \
  --uri="https://<servicio>.run.app/api/calendar-events/reminders/check" \
  --http-method=GET \
  --location=us-central1
```

---

## 13. Dependencias principales

| Paquete | Versión (package.json) | Uso |
|---|---|---|
| `next` | 16.3.0 | Framework / route handlers / `output: standalone` |
| `react` / `react-dom` | 19.2.4 | Requerido por Next (no hay UI) |
| `@supabase/supabase-js` | ^2.108.2 | Persistencia |
| `@google-cloud/pubsub` | ^6.0.1 | Publicación |
| `node-cron` | ^4.6.0 | Cron interno opcional |
| `jest` / `ts-jest` | ^30.4.2 / ^29.4.11 | Tests |
| `typescript` | ^5 | Lenguaje |
| `eslint` / `eslint-config-next` | ^9 / 16.3.0 | Lint |
| `tailwindcss` | ^4 | No se usa (sin UI) |

Node.js 22+ (Docker usa `node:22-alpine`).

---

## 14. Estructura del proyecto

```
app/
  api/calendar-events/
    route.ts                   # POST, GET
    [id]/route.ts              # PUT, DELETE
    reminders/check/route.ts   # GET
  layout.tsx · page.tsx · globals.css · favicon.ico
instrumentation.ts             # cron interno opcional
src/
  __mocks__/                   # supabase, uuid
  domain/
    entities/CalendarEvent.ts
    enums/{EventType,PubSubMessageType}.ts
    interfaces/{ICalendarEventRepository,IEventPublisher}.ts
  application/
    dtos/CalendarEventDTO.ts
    use-cases/{Create,List,Update,Delete}EventUseCase.ts
    services/CalendarPubSubService.ts
  infrastructure/
    database/supabase/{client,CalendarEventRepository,mappers}.ts
    pubsub/{client,constants,CalendarEventPublisher,checkDueReminders}.ts
  shared/utils/validators.ts   # vacío
Dockerfile (dockerfile)        # multi-stage: deps → builder → runner
docker-compose.yml
jest.config.ts · jest.setup.ts · eslint.config.mjs · next.config.ts · tsconfig.json
postman/                       # colección y environments (local, cloudrun)
```

---

## 15. Relación con otros servicios

| Servicio | Relación |
|---|---|
| `notification-microservice` (repo hermano `notification-microservice-pubsub`) | Consumidor de `sub-notification-calendar`. Espera el envelope de §7. Tiene handlers para los cuatro `eventType`. |
| Servicio de mascotas / usuarios | Origen de `petId` y `userId`. Este servicio **no** valida que existan. |
| Supabase | Persistencia de `calendar_events`. |
| Google Cloud Pub/Sub | Topic `calendar-event` (publish). |
| Cloud Scheduler | Dispara el chequeo de recordatorios en Cloud Run. |

---

## 16. Convenciones de trabajo

- Idioma: documentación y mensajes de error en **español**; código en inglés/español mezclado (nombres de campos en inglés).
- Commits: mensajes en inglés o español sin convención estricta en el historial.
- No mezclar queries directas y use cases en el mismo archivo.
- Antes de tocar `src/infrastructure/pubsub/`, revisar el contrato de §7.
- Antes de subir umbrales de cobertura, correr `npm run test:coverage`.
