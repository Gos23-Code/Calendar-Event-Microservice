export const CALENDAR_TOPIC_NAME = process.env.PUBSUB_CALENDAR_TOPIC || 'calendar';

// Máximo de intentos de publicación de un recordatorio antes de dejar de reintentarlo
export const MAX_REMINDER_ATTEMPTS = 3;
