// Nombres alineados con el `eventType` de nivel superior que espera
// el notification-microservice (ver su EventRegistry en calendarEvents.handlers.ts)
export enum PubSubMessageType {
  CALENDAR_PET_CREATED = 'CALENDAR_PET_CREATED',
  CALENDAR_USER_CREATED = 'CALENDAR_USER_CREATED',
  CALENDAR_EVENT_UPDATED = 'CALENDAR_EVENT_UPDATED',
  CALENDAR_EVENT_REMINDER = 'CALENDAR_EVENT_REMINDER'
}
