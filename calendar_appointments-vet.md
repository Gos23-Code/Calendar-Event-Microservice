# Calendar · Citas de veterinaria (appointments) — avance y pendientes

> Documento de retoma. Describe lo que ya está hecho en el repo, lo que falta y cómo probarlo.
> Fuentes de la spec: `CALENDAR_SERVICE_CHANGES.md` (qué debe hacer Calendar) y `CONTRATOS_COMPARTIDOS.md` (JWT, errores, acceso, eventos).
> Última actualización: 2026-11-11.

---

## 1. Estado general

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Cimientos: tabla, máquina de estados, JWT/JWKS, clave interna | Terminada (falta verificar arranque sin `INTERNAL_API_KEY`) |
| 2 | Disponibilidad y creación de citas | En curso: pasos 1, 2 y 3 implementados. Falta probar en Postman |
| 3 | Transiciones (confirmar, rechazar, cancelar, check-in, etc.) y consultas | Pendiente |
| 4 | Eventos Pub/Sub y recordatorios | Pendiente |
| 5 | Integración real con Veterinary y Pets | Pendiente (depende de contratos de otros equipos) |
| 6 | Migración a proyecto nuevo de GCP | **Urgente: el proyecto actual vence el 18 de noviembre** |

Estado de pruebas (última corrida completa): **26 suites y 288 tests pasan**. `tsc` y lint limpios. El build de producción pasó con las rutas nuevas. Nada está commiteado en git.

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Cancelar vs borrar | Una cita se **cancela**, no se borra. |
| Detalle de la cita | Lo arma **Calendar** (no el frontend). |
| Acceso a Supabase | `service_role` **solo en el servidor**, en `infrastructure/composition/appointmentDependencies.ts`. |
| Elegibilidad de empleados | La define el **catálogo de Veterinary** (`eligibleEmployeeIds`). Calendar solo ofrece franjas de esos empleados. |
| Licencia | El catálogo indica `requiresLicense`. Si el profesional no tiene licencia verificada → 403 `LICENSE_REQUIRED`. |
| Precios y duraciones | Salen de Veterinary (Fase 5). Mientras tanto, de la semilla `seed.json`, no del código. |
| Tenant | `vet_id` del token distinto de la ruta → **403 `TENANT_MISMATCH`** (contrato 1.5). Recurso de otra clínica → **404** (CAL-02). |
| Formato de error | `{ timestamp, status, error, message, code }`. `error` es la frase HTTP (`"Not Found"`). |
| Cuenta de empleados | `access` de Veterinary es la fuente de verdad de permisos (`APPOINTMENT_MANAGE`). Caché de 60 s. |
| Login del servicio User | Ruta `/auth/local`. |

---

## 3. Lo que está hecho

### 3.1 Fase 1 (cimientos)

- **Migración** `supabase/migrations/20261110120000_appointments.sql`: tabla `public.appointments`, idéntica a la que se ejecutó en Supabase. Incluye la restricción `no_overlap` (doble reserva por veterinario).
- **Pruebas de restricciones** `supabase/tests/appointments_constraints.sql`: ejecutado en el SQL Editor → `Success`.
- **Máquina de estados** `src/domain/services/appointmentStateMachine.ts`.
- **Validación JWT** (`src/infrastructure/auth/`): JWKS, `iss`, `aud`, claims de dueño (`USER`) y de clínica (`VETERINARY`).
- **Clave interna** `internalApiKey.ts`: comparación en tiempo constante. `instrumentation.ts` falla al arrancar si falta `INTERNAL_API_KEY`.

### 3.2 Fase 2, paso 1 (disponibilidad)

- `src/shared/utils/zonedTime.ts`: conversión hora de pared ↔ UTC en una zona (con horario de verano).
- `src/domain/services/availability.ts`: horario de clínica ∩ horario de empleado, menos bloqueos y citas activas. Sin franjas en el pasado. Anticipación mínima configurable (60 min para la app, 0 para la clínica).

### 3.3 Fase 2, paso 2 (puerto simulado de agenda)

- `src/domain/interfaces/IScheduleRulesProvider.ts`: puerto hacia Veterinary.
- `src/infrastructure/veterinary/SimulatedScheduleRulesProvider.ts`: horario lunes a sábado de 8 a 5, almuerzo de 12 a 1, tres empleados de demo.

### 3.4 Fase 2, paso 3 (creación de citas)

**Dominio**
- `domain/entities/Principal.ts`: identidad del token (dueño o clínica).
- `domain/entities/Appointment.ts`: registro de cita.
- `domain/errors/AppError.ts`: error con estatus HTTP y código estable.
- `domain/services/tenant.ts`: `assertSameVeterinary` (403) y `assertResourceBelongsTo` (404, para rutas por id futuras).
- Ports: `IClinicConfigProvider`, `IServiceCatalog`, `IPetAccessProvider`, `IVeterinaryAccess`, `IAppointmentRepository`.

**Aplicación**
- `application/services/findAvailableSlot.ts`: busca la franja real. Errores: 404 `EMPLOYEE_NOT_FOUND`, 409 `EMPLOYEE_NOT_ELIGIBLE`, 409 `SLOT_UNAVAILABLE`.
- `application/use-cases/CreateClinicAppointmentUseCase.ts`: la clínica crea la cita (nace `CONFIRMED`). Valida tenant, acceso (`access`), permiso `APPOINTMENT_MANAGE`, servicio, mascota, licencia, elegibilidad y franja.
- `application/use-cases/RequestAppointmentUseCase.ts`: el dueño solicita la cita (nace `REQUESTED` o `CONFIRMED` según la clínica). Valida clínica activa, reservas en línea, mascota propia y compartida, servicio y franja (con 1 h de anticipación). Asigna el primer empleado elegible libre.

**Infraestructura**
- `infrastructure/veterinary/VeterinaryAccessClient.ts`: cliente del endpoint `access` (`X-Internal-Api-Key`, timeout 3 s, caché 60 s, 503 si falla).
- `infrastructure/veterinary/simulated/`: configuración de clínica, catálogo de servicios y mascotas, leídos de `seed.json`.
- `infrastructure/veterinary/simulated/seed.json`: semilla de demo (clínica, servicios con duración, precio y elegibilidad, mascotas y compartidas). Marcada como semilla de prueba.
- `infrastructure/veterinary/simulated/simulatedSeed.ts`: carga la semilla. Variables opcionales `SIM_VET_ID` y `SIM_OWNER_USER_ID` para apuntar la demo a datos reales de tus pruebas.
- `infrastructure/database/supabase/SupabaseAppointmentRepository.ts`: consulta citas activas e inserta. Traduce el código `23P01` a conflicto de franja.
- `infrastructure/composition/appointmentDependencies.ts`: arma las dependencias una sola vez. Es el **único** lugar con la clave `service_role`. Normaliza la URL de Supabase (quita `/rest/v1`).
- `infrastructure/http/appointmentHandlers.ts`: validación del cuerpo (400 `VALIDATION_ERROR`), handlers y formato de respuesta.
- `infrastructure/http/errorBody.ts`: convierte cualquier error al formato común. Los errores inesperados no exponen su mensaje interno.

**Rutas**
- `app/api/veterinaries/[veterinaryId]/appointments/route.ts` → `POST` (clínica).
- `app/api/veterinaries/[veterinaryId]/appointment-requests/route.ts` → `POST` (dueño).

**Postman**
- `postman/Calendar-Citas-Completo.postman_collection.json` (18 requests):
  - Carpeta 0 — Auth: JWKS, login del dueño (`0.2`), login del empleado (`0.3`), contexto de clínica (`0.4`). Guardan los tokens en el environment.
  - Carpeta 1 — Citas del dueño (8 casos). Se pueden probar hoy.
  - Carpeta 2 — Citas de la clínica (6 casos). Dependen de datos en Veterinary.
- `postman/Calendar-Citas-Local.postman_environment.json`: `baseUrl`, `userServiceUrl`, `loginPath`, credenciales (tipo secret), `ownerToken`, `ownerSub`, `clinicBaseToken`, `clinicToken`.

**Documentos viejos que siguen describiendo la API anterior**
- `CONTEXTO_PROYECTO.md`.
- `postman/Calendar-Event-Microservice.postman_collection.json` y los environments `Calendar-Local` y `Calendar-CloudRun`.

---

## 4. Variables de entorno

| Variable | Uso | Estado |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL base de Supabase (sin `/rest/v1`) | Configurada |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role`, solo servidor | Configurada |
| `INTERNAL_API_KEY` | Clave entre servicios. El servidor no arranca sin ella | Configurada |
| `VETERINARY_SERVICE_URL` | `https://veterinary-microservice-petsapp-20369076707.us-central1.run.app` | Configurada |
| `JWT_JWKS_URL` | `https://user-microservice-pets-20369076707.us-central1.run.app/.well-known/jwks.json` | Configurada |
| `JWT_ISSUER` | `myanimalog-user-service` | Configurada |
| `JWT_AUDIENCE` | `myanimalog-api` | Configurada |
| `SIM_OWNER_USER_ID` | `sub` del dueño de prueba (para que las mascotas de demo le pertenezcan) | **Pendiente** (lo sacas de la consola de Postman en `0.2`) |
| `SIM_VET_ID` | Id de la clínica de demo (opcional, por defecto la de `seed.json`) | Opcional |
| `.env.example` | Plantilla con todas las variables, sin valores secretos | Hecho |

---

## 5. Lo que falta

### 5.1 Inmediato: cerrar el paso 3 (pruebas)

1. Copiar el valor de `ownerSub` (environment de Postman, después de correr `0.2`) a `SIM_OWNER_USER_ID` en `.env.local`. Reiniciar `npm run dev`.
2. Correr la carpeta **1. Citas — dueño**. Resultados esperados:

| Request | Esperado |
|---|---|
| 1.1 Solicitud OK | 201, `REQUESTED`, asignada a Dr. Luis |
| 1.2 Misma franja | 201, asignada a Dra. Sara |
| 1.3 Baño y corte | 201, asignada a Camila |
| 1.4 Menos de 1 h | 409, `SLOT_UNAVAILABLE` |
| 1.5 Sin token | 401, `MISSING_TOKEN` |
| 1.6 Mascota sin dueño con app | 403, `PET_NOT_OWNED` |
| 1.7 Sin `serviceId` | 400, `VALIDATION_ERROR` |
| 1.8 Token de clínica | 403, `OWNER_TOKEN_REQUIRED` |

3. Verificar en Supabase → Table editor → `appointments` que aparezcan las filas de 1.1, 1.2 y 1.3.
4. Antes de volver a correr: borrar las citas de prueba (SQL en la descripción de la colección) o cambiar `startsAt`.

### 5.2 Carpeta 2 (clínica): depende de Veterinary

Necesita que el equipo de Veterinary confirme:
- Una clínica existente con id igual a `SIM_VET_ID` (o al `veterinaryId` de la colección).
- Un empleado con `APPOINTMENT_MANAGE`.
- La mascota de prueba compartida con esa clínica.

También hace falta `clinicEmail` y `clinicPassword` en el environment, y un empleado de clínica en el servicio User.

### 5.3 Fase 2: pendientes de datos de otros equipos

- Configuración de clínica (`allowOnlineBooking`, `bookingRequiresConfirmation`, `cancellationMinHours`): hoy es simulada.
- Catálogo de servicios con elegibilidad y licencia: hoy es simulado.
- Dueño de mascota (Pets) y compartido desde el lado del dueño: hoy es simulado.
- Endpoint de miembros de la clínica (para listar la agenda sin mascota).
- Contrato del catálogo de Veterinary (el que mencionaste que enviarás).

### 5.4 Fase 3 — transiciones y consultas

- Rutas: confirmar, rechazar, cancelar (con plazo de `cancellationMinHours`), reprogramar, check-in, completar, no asistió.
- Consultas: agenda por día, semana o veterinario, y `GET /me/appointments`.
- Reglas de tiempo: `NO_SHOW` solo después de `starts_at`.

### 5.5 Fase 4 — eventos y recordatorios

- Publicar `APPOINTMENT_REQUESTED`, `APPOINTMENT_CONFIRMED`, `APPOINTMENT_REJECTED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_REMINDER`, `APPOINTMENT_COMPLETED` en el topic `veterinary-appointments`, con el sobre común, detrás de `EVENTS_ENABLED`.
- Job `POST /internal/jobs/appointments/reminders`: citas `CONFIRMED` que empiezan en 23–24 h. Idempotente con `reminder_sent_at`.
- Decidir si el job viejo de `calendar_events` se retira.

### 5.6 Fase 5 — integración real

- Sustituir los simulados por clientes reales de Veterinary y Pets.
- Caché: 60 s para permisos, 5 min para reglas de agenda.
- Dueños sin app: destinatario con `recipient` (email/teléfono) desde Pets.

### 5.7 Fase 6 — migración de GCP (urgente)

- **El proyecto de Google Cloud vence el 18 de noviembre de 2026.**
- Recrear el job de Cloud Scheduler en el proyecto nuevo (`/api/calendar-events/reminders/check` y, cuando exista, `/internal/jobs/appointments/reminders`).
- Rotar los secretos, incluida `INTERNAL_API_KEY`.
- Confirmar que ninguna variable de entorno tenga espacios al inicio o al final.
- Cloud Run necesita `INTERNAL_API_KEY` al arrancar; si no, el servicio no levanta.

### 5.8 Otros pendientes

- Verificar el arranque local sin `INTERNAL_API_KEY` (debe fallar con mensaje claro).
- Revisar las vulnerabilidades que reportó `npm audit` al instalar `jose`.
- Cobertura: `npm run test:coverage` falla por el umbral de ramas (~77% contra 80%). Ya estaba así antes de estos cambios.
- Actualizar `CONTEXTO_PROYECTO.md`, el README y la colección de la API vieja.

---

## 6. Riesgos y notas

- **Datos simulados:** la ruta del dueño depende de la semilla. `SIM_OWNER_USER_ID` tiene que ser el `sub` del token de prueba; si no, responde `403 PET_NOT_OWNED`.
- **Ruta de la clínica:** depende de Veterinary. Si la clínica, el empleado o la mascota no existen allí, responde 404 o `ACCESS_DENIED`.
- **Citas de prueba:** quedan en la base. Hay que borrarlas antes de volver a correr la colección.
- **Tokens:** duran unos 15 minutos. Si aparece un 401 en medio de la carpeta, vuelve a correr `0.2`.
- **Variables de colección:** la colección todavía tiene `ownerToken`, `clinicBaseToken` y `clinicToken` como variables de colección. Como el environment tiene prioridad, usa el environment **Calendar - Citas Local**.
- **Sin commit:** ningún cambio de esta fase está commiteado.
- **Documentos del panel de agenda** (`panel-vet-agenda-dia.md`, `panel-vet-agenda-detalle-cita.md`): son insumo de diseño y no se modificaron.

---

## 7. Próximo paso

1. Poner `SIM_OWNER_USER_ID` y reiniciar el servidor.
2. Correr la carpeta 1 de Postman y pasarme los resultados.
3. Mientras tanto: pedir a Veterinary el id de clínica de prueba y el contrato del catálogo, y definir `clinicEmail` / `clinicPassword`.
4. Arrancar la Fase 6 (GCP) antes del 18 de noviembre, porque no depende de las fases 2 a 5.
