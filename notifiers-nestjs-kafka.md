# Microservicio Notifiers (NestJS + Kafka)

## Contexto

Laboratorio de Ingeniería de Software: sistema Wallet basado en microservicios. Este documento cubre el servicio **Notifiers**, que consume mensajes de un tópico de Kafka y envía correos.

### Arquitectura (según el diagrama)

Despliegue en **Render**, con los servicios Users, Notifiers y Accounts.

| Paso | Descripción | Tipo |
|------|-------------|------|
| 1 | Users crea/actualiza usuarios en TiDB (MySQL) | sync |
| 2 | Users publica en el tópico de Aiven Kafka | async |
| 3 | Notifiers recibe el mensaje nuevo de email | async |
| 4 | Notifiers envía el email por SMTP/API | sync |
| 5 | Users crea la cuenta en Accounts | sync |
| 6 | Accounts crea la cuenta en TiDB (MySQL) | sync |
| 7 | Accounts publica en el tópico | async |

- **Mensajería:** Aiven Kafka (tópico)
- **Base de datos:** TiDB MySQL (tablas `users` y `accounts`)
- **Salida de correo:** SMTP / API de un proveedor

### Decisiones tomadas

- **Lenguaje:** TypeScript. Los mensajes de Kafka son contratos y TS permite tiparlos y validarlos.
- **Framework:** NestJS, por su soporte nativo de microservicios con Kafka (`@nestjs/microservices`) y por ser muy parecido a Angular (módulos, decoradores, inyección de dependencias).
- **Angular no aplica:** es un framework de frontend y un microservicio corre en el backend.
- **Módulos:** CJS (CommonJS) con jest al correr `nest new`. Los imports relativos no necesitan extensión `.js` y es lo más común en la documentación de Nest.
- **Gestor de paquetes:** npm.

---

## 1. Crear el proyecto

```bash
npm i -g @nestjs/cli
nest new notifiers
cd notifiers
npm i @nestjs/microservices @nestjs/config kafkajs nodemailer zod
npm i -D @types/nodemailer
```

Al preguntar por el sistema de módulos, elegir **CJS (CommonJS) con jest**.

## 2. Estructura de archivos

```
notifiers/
├── .env.example
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── health.controller.ts
    └── notifications/
        ├── email-message.schema.ts
        ├── notifications.controller.ts
        └── mailer.service.ts
```

`main.ts` y `app.module.ts` reemplazan los que genera Nest. Se pueden borrar `app.controller.ts`, `app.service.ts` y `app.controller.spec.ts`, porque ya no se usan.

## 3. Código

### `src/main.ts`

```ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

// En Render las variables de entorno no soportan saltos de línea reales,
// así que pega los certificados con "\n" y aquí los convertimos.
const pem = (v?: string) => v?.replace(/\\n/g, '\n');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'notifiers',
        brokers: [process.env.KAFKA_BROKER!], // host:port de Aiven
        ssl: {
          ca: [pem(process.env.KAFKA_CA)!],
          cert: pem(process.env.KAFKA_CERT),
          key: pem(process.env.KAFKA_KEY),
        },
      },
      // groupId propio para no competir con otros servicios
      consumer: { groupId: 'notifiers-group' },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000); // health check para Render
}
bootstrap();
```

### `src/app.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsController } from './notifications/notifications.controller';
import { MailerService } from './notifications/mailer.service';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [NotificationsController, HealthController],
  providers: [MailerService],
})
export class AppModule {}
```

### `src/health.controller.ts`

```ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
```

### `src/notifications/email-message.schema.ts`

```ts
import { z } from 'zod';

// Contrato del "Mensaje nuevo de email" (Paso-3).
// Compártelo con los productores (Users / Accounts).
export const EmailMessageSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type EmailMessage = z.infer<typeof EmailMessageSchema>;
```

### `src/notifications/notifications.controller.ts`

```ts
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailMessageSchema } from './email-message.schema';
import { MailerService } from './mailer.service';

@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly mailer: MailerService) {}

  // El nombre del tópico es el patrón del evento
  @EventPattern(process.env.KAFKA_TOPIC ?? 'email.notifications')
  async handleEmail(@Payload() payload: unknown) {
    const parsed = EmailMessageSchema.safeParse(payload);
    if (!parsed.success) {
      // Mensaje inválido: lo descartamos para no bloquear el consumo
      this.logger.warn(`Mensaje inválido: ${parsed.error.message}`);
      return;
    }

    try {
      await this.mailer.send(parsed.data); // Paso-4: enviar email
    } catch (err) {
      this.logger.error(`Falló el envío a ${parsed.data.to}`, err as Error);
      // TODO: reintentos / dead letter topic
    }
  }
}
```

### `src/notifications/mailer.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailMessage } from './email-message.schema';

@Injectable()
export class MailerService {
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  async send({ to, subject, body }: EmailMessage) {
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html: body,
    });
  }
}
```

### `.env.example`

Copiar a `.env` y llenar con los datos reales. No subir `.env` a GitHub.

```env
PORT=3000
KAFKA_BROKER=tu-servicio-xxxx.aivencloud.com:12345
KAFKA_TOPIC=email.notifications
# Contenido de los .pem de Aiven en una sola línea, con \n en lugar de saltos
KAFKA_CA=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
KAFKA_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
KAFKA_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
SMTP_HOST=smtp.tuproveedor.com
SMTP_PORT=587
SMTP_USER=usuario
SMTP_PASS=clave
MAIL_FROM="Wallet <no-reply@tudominio.com>"
```

---

## 4. Probar en local

```bash
npm run start:dev
```

Publicar este JSON en el tópico desde la consola de Aiven:

```json
{
  "to": "tucorreo@mail.com",
  "subject": "Hola",
  "body": "<b>Prueba</b>"
}
```

## 5. Notas importantes

- **Certificados de Aiven:** `ca.pem`, `service.cert` y `service.key` se descargan desde la consola del servicio Kafka. Si el servicio usa SASL en lugar de certificado de cliente, hay que cambiar la config de `ssl` por `sasl` en `main.ts`.
- **Tópico:** debe existir en Aiven antes de arrancar el servicio. El nombre por defecto es `email.notifications`, configurable con `KAFKA_TOPIC`.
- **Productores:** Users y Accounts deben publicar el mismo JSON (`to`, `subject`, `body`). Si son Spring Boot, hay que replicar esa estructura en Java.
- **Render:** como el servicio expone HTTP (`/health`), se despliega como **Web Service**. Si se quita el HTTP, usar **Background Worker**.
- **Manejo de errores actual:** un mensaje inválido se descarta con un warning y un fallo de SMTP solo se registra en el log.

## 6. Pendientes

- Reintentos y dead letter topic para fallos de SMTP.
- Productor de Kafka en el servicio Users (Paso-2).
- Plantillas de correo en lugar de HTML en el `body`.
