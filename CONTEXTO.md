# Contexto del proyecto: Notifiers (Wallet)

Resumen de lo que se hizo, cómo está montado y qué falta. Sin secretos: los valores reales están solo en `.env` y `certs/`, que no se suben a git.

Última actualización: 11 de octubre de 2026.

---

## 1. Qué es

Microservicio **Notifiers** del sistema **Wallet** (laboratorio de Ingeniería de Software). Consume los eventos de dominio que publica el microservicio **Users** (otro equipo, Spring Boot) en Kafka y envía el correo correspondiente.

```
Users (Spring Boot) ──publica──▶ Kafka (Aiven) ──consume──▶ Notifiers (NestJS) ──▶ Brevo API ──▶ correo
                                                                │
                                                                └──▶ Supabase (historial + idempotencia)
```

| Pieza | Tecnología |
|---|---|
| Lenguaje / framework | TypeScript, NestJS 12 (`@nestjs/microservices` con transporte Kafka) |
| Mensajería | Aiven Kafka, servicio `kafka-wallet` del proyecto **wallet-platform** |
| Base de datos | Supabase (Postgres), con el driver `pg` |
| Envío de correo | **Brevo API** (por HTTPS). Si no hay API key, usa SMTP con nodemailer (Gmail). |
| Validación de mensajes | zod |
| Tests | Jest (ts-jest) |
| Despliegue previsto | Render (Web Service, por el endpoint `/health`) |

> El md original (`notifiers-nestjs-kafka.md`) hablaba de TiDB/MySQL y de un tópico genérico `email.notifications`. Las dos cosas cambiaron: la base de datos es Supabase/Postgres, y ahora se consumen los eventos de Users.

---

## 2. Arquitectura hexagonal

```
src/
├── main.ts                     Arranque: HTTP + consumidor Kafka (SASL o certificado)
├── load-env.ts                 Carga .env antes que nada (los decoradores leen process.env al importar)
├── app.module.ts
├── domain/                     Sin dependencias de frameworks
│   ├── email-message.ts        { to, subject, body }
│   ├── notification.ts         Entidad: create / assignId / markSent / markFailed
│   ├── user-event.ts           Envelope de los eventos de Users
│   └── ports/
│       ├── mailer.port.ts
│       ├── notification-repository.port.ts
│       └── processed-event-repository.port.ts
├── application/                Solo depende de los puertos
│   ├── send-email-notification.use-case.ts   Guarda PENDING → envía → SENT/FAILED
│   ├── handle-user-event.use-case.ts         Omite sin email → deduplica eventId → envía
│   ├── user-email.templates.ts               HTML de creada/actualizada/eliminada (con escape)
│   └── *.spec.ts
└── infrastructure/             Adaptadores
    ├── messaging/
    │   ├── user-events.controller.ts   @EventPattern de los 3 tópicos (envoltorio de Nest)
    │   ├── user-event.listener.ts      Valida con zod, llama al caso de uso, logs sin PII, nunca lanza
    │   ├── user-event.schema.ts        Contrato zod del envelope
    │   └── user-event.listener.spec.ts
    ├── mailer/
    │   ├── brevo-mailer.adapter.ts      Brevo API (HTTPS)
    │   └── nodemailer-mailer.adapter.ts SMTP
    ├── persistence/
    │   ├── postgres-notification.repository.ts
    │   └── postgres-processed-event.repository.ts
    ├── database/                Pool de pg + DatabaseService
    ├── http/health.controller.ts  GET /health → { status: "ok" }
    └── notifications.module.ts  Conecta cada puerto con su adaptador
```

- El adaptador de correo se elige solo: con `BREVO_API_KEY` usa Brevo; sin ella, SMTP.
- Los casos de uso se crean con `useFactory`, así que no dependen de Nest.
- La lógica del listener está en una clase sin Nest (`UserEventListener`) para poder probarla (ver la sección 9).

---

## 3. Eventos que consume

Consumer group: **`notificaciones-service`**, con el nombre exacto: se desactivó el sufijo `-server` que agrega Nest con `postfixId: ''`. La primera vez lee desde el inicio (`fromBeginning: true`) y hace commit automático.

| Tópico | eventType | Correo | Estado actual |
|---|---|---|---|
| `users.created` | `USER_CREATED` | Tu cuenta ha sido creada (nombre, email, rol) | ✅ Funciona y está probado |
| `users.updated` | `USER_UPDATED` | Tu cuenta ha sido actualizada (+ estado) | ✅ Funciona y está probado |
| `users.deleted` | `USER_DELETED` | Tu cuenta ha sido eliminada | ➖ Users manda solo el `id`, así que se omite sin correo (decisión acordada) |
| `accounts.created` | `ACCOUNT_CREATED` | Tu cuenta Wallet está lista (id, moneda, saldo, estado) | ✅ Funciona y está probado (el email sale del directorio de contactos) |

Envelope:

```json
{
  "eventId": "<uuid>",
  "eventType": "USER_CREATED | USER_UPDATED | USER_DELETED",
  "occurredAt": "<ISO-8601>",
  "aggregateId": "<userId>",
  "payload": { "id": "<userId>", "name": "<nombre>", "email": "<email>", "role": "MEMBER", "status": "ACTIVE" }
}
```

**Eventos de Accounts:** `accounts.created` trae `{ accountId, userId, balance, currency, status }`, **sin email ni nombre**. Notifiers guarda `userId → name, email` en la tabla `user_contacts` cada vez que llega `users.created` o `users.updated` (proyección local) y la consulta al llegar la cuenta. Si el usuario no está en el directorio, se omite con un aviso y no se marca como procesado. Si Accounts agrega `accountNumber` al payload, el correo lo muestra.

Comportamiento:
- **Idempotencia:** `INSERT ... ON CONFLICT DO NOTHING` en `processed_events` antes de enviar. Si el `eventId` ya está, se ignora el evento.
- **Sin email** (por ejemplo `USER_DELETED` solo con `id`): log informativo, no se envía y no se marca como procesado. Si Users lo manda corregido, el correo sale.
- **Inválido** (falta `eventId`, email mal formado, etc.): `WARN` con los nombres de los campos, nunca con los valores. Se descarta.
- **Fallo de envío:** queda `FAILED` en `notifications.error_message`, se loguea y el consumo continúa. No hay reintentos.
- **Logs sin PII:** solo `eventId`, `aggregateId`, `topic` y el estado. Los emails dentro de mensajes de error se reemplazan por `[email]`.
- **HTML escapado:** los datos de Users se escapan antes de meterlos en el correo.

---

## 4. Infraestructura

### Kafka (Aiven, proyecto wallet-platform)
- Broker: `kafka-wallet-wallet-platform.f.aivencloud.com:25157`
- Seguridad: **SASL_SSL** con mecanismo **PLAIN**, usuario `avnadmin`
- CA: `certs/ca-wallet-platform.pem`. Se obtuvo del broker y se verificó contra el `service.cert` descargado de Aiven.
- El puerto 25157 es solo para SASL. La autenticación por certificado (`service.cert`/`service.key`, también en `certs/`) usa **otro puerto** del mismo servicio. `main.ts` soporta las dos: si `KAFKA_CERT` y `KAFKA_KEY` están definidas, usa certificado.
- `connectionTimeout` y `authenticationTimeout` están en 10 s; con el valor por defecto de 1 s fallaba el handshake con Aiven.

> Existe también un Kafka de pruebas viejo, `kafka-wallet-unicolombo-4fd9`, en otro proyecto de Aiven y con el tópico `email.notifications`. Ya no se usa y consume créditos del trial, así que se puede apagar o borrar. Su CA quedó como `certs/ca-unicolombo-viejo.pem`.

### Supabase (Postgres)
Tablas (ver `db/schema.sql`):
- `notifications`: historial de cada envío (`to_email`, `subject`, `body`, `status` PENDING/SENT/FAILED, `topic`, `error_message`, `created_at`, `sent_at`).
- `processed_events`: `event_id` (PK), `topic`, `processed_at`. Sirve para la idempotencia.
- `user_contacts`: `user_id` (PK), `name`, `email`, `updated_at`. Directorio para los eventos de Accounts. Se llenó una vez con los eventos ya existentes en `users.*`.
- Las dos tienen **RLS activado**. El servicio entra como `postgres` (dueño), así que RLS no lo afecta, pero bloquea las keys públicas de Supabase.

### Brevo
- Cuenta `wallet-system`, plan gratis (300 correos al día).
- Remitente verificado: `daniel.palaciomercado@unicolombo.edu.co`. `MAIL_FROM` tiene que ser un remitente verificado.
- Como el dominio no está autenticado (DKIM/DMARC), Brevo envía desde `...@<id>.brevosend.com` con el nombre "Wallet". Algunos correos pueden caer en spam.
- Se usa la API y no SMTP porque el plan gratis de Render bloquea los puertos SMTP salientes. Conviene confirmarlo en la documentación de Render.

---

## 5. Variables de entorno

Valores de ejemplo en `.env.example`; los reales, solo en `.env`.

| Variable | Para qué |
|---|---|
| `PORT` | Puerto HTTP (`/health`) |
| `KAFKA_BROKER` | `host:port` del broker |
| `KAFKA_CA` | `ca.pem` en **una sola línea** con `\n` literales |
| `KAFKA_USERNAME` / `KAFKA_PASSWORD` | Credenciales SASL |
| `KAFKA_SASL_MECHANISM` | `plain` \| `scram-sha-256` \| `scram-sha-512` |
| `KAFKA_GROUP_ID` | `notificaciones-service` |
| `KAFKA_CERT` / `KAFKA_KEY` | Opcional: certificado de cliente en lugar de SASL |
| `BREVO_API_KEY` | Si está definida, se envía por Brevo |
| `MAIL_FROM` | `"Wallet <remitente@verificado>"` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Alternativa SMTP (Gmail con contraseña de aplicación) |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` / `DB_SSL_MODE` | Supabase |

Para pasar un `.pem` a una sola línea en PowerShell:
```powershell
(Get-Content certs\ca-wallet-platform.pem -Raw).Trim() -replace "`r?`n", '\n'
```

---

## 6. Cómo correr y probar

```bash
npm install
npm run start:dev      # esperar "Consumer has joined the group"
npm test               # 10 tests
```

- Health: `GET http://localhost:3000/health` → `{"status":"ok"}`
- Prueba manual: en Aiven, `kafka-wallet` → Topics → `users.created` → Messages → **Produce message** con el JSON de la sección 3 y un `eventId` nuevo.
- Resultado esperado: en la terminal, `Correo ENVIADO eventId=... topic=users.created`; llega el correo; en Supabase aparece la fila con `status = SENT`.
- Si mandas **el mismo `eventId`** otra vez, sale `Evento duplicado ignorado` y no llega un segundo correo.

Consultas útiles en Supabase:
```sql
select id, subject, status, topic, error_message, created_at from notifications order by id desc limit 10;
select topic, count(*) from processed_events group by topic;
```

---

## 7. Pruebas realizadas

| Prueba | Resultado |
|---|---|
| Kafka → Notifiers → Gmail SMTP → Supabase (tópico viejo) | ✅ SENT |
| Igual, pero con Brevo API | ✅ SENT, Brevo reporta `delivered` |
| Eventos reales de Users en `users.created` | ✅ 4 correos "Tu cuenta ha sido creada" con SENT; idempotencia registrada |
| Eventos viejos de `users.created` sin `email` | Omitidos (eran de antes de que Users agregara el email) |
| `users.deleted` (solo `id`) | Omitidos sin correo, según lo acordado |
| `users.updated` | Sin eventos todavía |

---

## 8. Acuerdos con el equipo de Users

- Users publica en `users.created`, `users.updated` y `users.deleted` con el envelope de la sección 3.
- Para eliminar se eligió **no enviar correo** (opción 1 de ellos). Si más adelante `DeleteUserService` incluye `name` y `email` en el evento, Notifiers lo envía sin cambiar código.
- **Pendiente de su lado:**
  - Quitar el envío directo por Gmail ("Gestion de Usuarios"); si no, cada usuario recibe dos correos.
  - Publicar `USER_UPDATED` al actualizar.
  - `occurredAt` sin zona horaria (`2026-10-10T17:49:07.414`). Debería llevar `Z` u offset. No rompe nada.
  - El correo actual de Users manda la contraseña temporal en texto plano.

---

## 9. Problemas encontrados y cómo se resolvieron

| Problema | Solución |
|---|---|
| `KAFKA_TOPIC` del `.env` no se leía: `@EventPattern` se evalúa al importar, antes de `ConfigModule` | `src/load-env.ts` (`process.loadEnvFile()`) importado en la primera línea de `main.ts` |
| Timeouts al conectar con Aiven | `connectionTimeout` / `authenticationTimeout` = 10 s |
| `This server does not host this topic-partition` | El `.env` apuntaba al Kafka viejo, sin los tópicos `users.*` |
| Nest le agrega `-server` al groupId | `postfixId: ''` |
| Jest no carga Nest 12 (solo ESM) con Node 24.5 | La lógica del listener está en una clase sin Nest; el controller solo delega. Con Node ≥ 24.9 Jest ya soporta `require(esm)`. El e2e de `test/` probablemente no corre por esto. |
| Brevo rechaza remitentes no verificados | `MAIL_FROM` = remitente verificado en Brevo |
| Fechas corridas 5 horas | La tabla existía con `timestamp without time zone`; se cambió a `TIMESTAMPTZ` con `ALTER TABLE` |
| Bug original: si el envío salía bien pero fallaba el UPDATE, quedaba FAILED | El caso de uso separa los errores de entrega y de persistencia |
| `service.key` suelto en la raíz del proyecto (se habría commiteado) | Movido a `certs/`, que está en `.gitignore` |

---

## 10. Docker

- `Dockerfile` en dos etapas (Node 24 Alpine): compila con todas las dependencias y la imagen final solo lleva `dist/` y dependencias de producción. Corre como usuario `node`.
- `.dockerignore` excluye `.env`, `certs/`, `node_modules` y `.git`: los secretos nunca entran a la imagen.
- Probar en local: `docker build -t notifiers .` y `docker run --rm --env-file .env -p 3000:3000 notifiers`.
- Si Docker Desktop responde con error 500: cerrarlo, `wsl --shutdown` y volver a abrirlo.

## 11. Pendientes

- [x] Commits locales (repo: `DanielPalacio12/wallet_notifications`).
- [ ] Push a GitHub (la cuenta `DanielPalacioM` debe aceptar la invitación de colaborador).
- [ ] Desplegar en **Render** como Web Service con runtime **Docker** (usa el `Dockerfile`):
  - *Environment* → **Add from .env** (sin `PORT` ni `SMTP_*`).
  - Health Check Path: `/health`.
  - El plan gratis se duerme a los 15 min sin tráfico HTTP: usar UptimeRobot contra `/health` cada 5 min.
- [ ] Probar en Render creando un usuario, con el PC apagado.
- [ ] Apagar o borrar el Kafka viejo `kafka-wallet-unicolombo-4fd9` en Aiven.
- [ ] Reintentos / dead letter topic para envíos fallidos (está como TODO en el listener).
- [ ] (Opcional) Autenticar el dominio en Brevo (DKIM/DMARC) para no caer en spam.
- [ ] (Opcional) Actualizar Node a ≥ 24.9 para poder testear módulos de Nest con Jest.

## 12. Seguridad

- **Rotar después del parcial:** la contraseña de Kafka de wallet-platform, la API key de Brevo y la contraseña de aplicación de Gmail. Las tres se compartieron por chat o comandos.
- Nunca subir `.env` ni `certs/`. Los dos están en `.gitignore`.
- La contraseña de Supabase que estuvo en `.env.example` se reemplazó por un valor de ejemplo. Si llegó a compartirse, hay que cambiarla en Supabase.
