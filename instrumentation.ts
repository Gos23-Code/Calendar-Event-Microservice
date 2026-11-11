export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // CAL-01: falla al arrancar si INTERNAL_API_KEY no está definida o tiene espacios.
    // Sin esta clave, los endpoints /internal/** y los jobs quedarían sin protección.
    const { getInternalApiKey } = await import('@/infrastructure/auth/internalApiKey');
    getInternalApiKey();

    // Este servicio es PUBLISHER en el topic "calendar-event". La única
    // suscripción a ese topic ("sub-notification-calendar") pertenece al
    // notification-microservice: si este servicio también hace pull() de
    // esa misma suscripción, compite por los mensajes y se los "roba" al
    // notification-microservice la mitad de las veces (Pub/Sub reparte los
    // mensajes de una suscripción entre todos sus consumidores, no los
    // duplica). Por eso NO arrancamos aquí un CalendarEventSubscriber.

    // El cron en proceso solo tiene sentido en un contenedor persistente
    // (Docker/docker-compose, `next dev`). En Cloud Run la instancia puede
    // escalar a cero entre requests, así que este setInterval no dispararía
    // de forma confiable — ahí usa Cloud Scheduler apuntando a
    // GET /api/calendar-events/reminders/check y deja esta variable en "false".
    if (process.env.ENABLE_INTERNAL_REMINDER_CRON === 'true') {
      const cron = await import('node-cron');
      const { checkDueReminders } = await import('@/infrastructure/pubsub/checkDueReminders');

      cron.schedule('* * * * *', async () => {
        try {
          const result = await checkDueReminders();
          if (result.notified.length > 0) {
            console.log(`⏰ Reminders notified: ${result.notified.length}`);
          }
          if (result.failed.length > 0) {
            console.error('❌ Reminders failed to notify:', result.failed);
            const gaveUp = result.failed.filter((f) => f.giveUp);
            if (gaveUp.length > 0) {
              console.error(`🛑 Giving up on ${gaveUp.length} reminder(s) after ${gaveUp[0].attempts} attempts:`, gaveUp.map((f) => f.id));
            }
          }
        } catch (error) {
          console.error('❌ Failed to check due reminders:', error);
        }
      });

      console.log('🕐 Reminder cron scheduled to run every minute (in-process)');
    } else {
      console.log('🕐 Internal reminder cron disabled — expecting an external scheduler to call GET /api/calendar-events/reminders/check');
    }
  }
}
