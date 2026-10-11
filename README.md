# Notificaciones (Notifiers)

Microservicio del sistema Wallet que consume los eventos de dominio del servicio **Users** desde Kafka (Aiven) y envía el correo correspondiente (Brevo API o SMTP). Cada envío queda registrado en Postgres (Supabase).

## Arquitectura hexagonal

```
src/
├── domain/            Entidades, eventos y puertos (sin dependencias de frameworks)
├── application/       Casos de uso y plantillas de correo (solo dependen de los puertos)
└── infrastructure/    Adaptadores: Kafka (entrada), HTTP /health, Brevo/SMTP y Postgres (salida)
```

## Eventos que consume

Consumer group: `notificaciones-service` (lee desde el inicio la primera vez).

| Tópico          | eventType      | Correo                          |
|-----------------|----------------|---------------------------------|
| `users.created` | `USER_CREATED` | Tu cuenta ha sido creada        |
| `users.updated` | `USER_UPDATED` | Tu cuenta ha sido actualizada   |
| `users.deleted` | `USER_DELETED` | Tu cuenta ha sido eliminada     |

```json
{
  "eventId": "<uuid>",
  "eventType": "USER_CREATED",
  "occurredAt": "2026-10-10T22:00:00Z",
  "aggregateId": "<userId>",
  "payload": { "id": "<userId>", "name": "Ana", "email": "ana@correo.com", "role": "MEMBER", "status": "ACTIVE" }
}
```

- **Idempotencia:** cada `eventId` se registra en `processed_events`; los duplicados se ignoran.
- **Sin email:** si el payload no trae `email` (hoy `USER_DELETED` llega solo con el `id`), el evento se omite sin enviar correo.
- **Errores:** un evento inválido o un envío fallido se loguean y el consumo continúa.
- **Logs sin PII:** solo `eventId`, `aggregateId`, `topic` y el estado del envío.

## Puesta en marcha

1. `npm install`
2. Ejecutar `db/schema.sql` en el SQL Editor de Supabase.
3. Copiar `.env.example` a `.env` y completar los valores. `KAFKA_CA` es el `ca.pem` de Aiven en una sola línea, con `\n` en lugar de saltos de línea (el archivo va en `certs/`, que no se sube al repo).
4. `npm run start:dev` y comprobar `GET http://localhost:3000/health`.

## Tests

```bash
npm test
```

## Despliegue (Render)

Web Service con build `npm install && npm run build`, start `npm run start:prod` y las mismas variables del `.env` en *Environment*.
