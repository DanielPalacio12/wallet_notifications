import { Module } from '@nestjs/common';
import { HandleAccountEventUseCase } from '../application/handle-account-event.use-case';
import { HandleUserEventUseCase } from '../application/handle-user-event.use-case';
import { SendEmailNotificationUseCase } from '../application/send-email-notification.use-case';
import { MAILER, MailerPort } from '../domain/ports/mailer.port';
import {
  NOTIFICATION_REPOSITORY,
  NotificationRepositoryPort,
} from '../domain/ports/notification-repository.port';
import {
  PROCESSED_EVENT_REPOSITORY,
  ProcessedEventRepositoryPort,
} from '../domain/ports/processed-event-repository.port';
import {
  USER_DIRECTORY,
  UserDirectoryPort,
} from '../domain/ports/user-directory.port';
import { BrevoMailerAdapter } from './mailer/brevo-mailer.adapter';
import { NodemailerMailerAdapter } from './mailer/nodemailer-mailer.adapter';
import { AccountEventsController } from './messaging/account-events.controller';
import { UserEventsController } from './messaging/user-events.controller';
import { PostgresNotificationRepository } from './persistence/postgres-notification.repository';
import { PostgresProcessedEventRepository } from './persistence/postgres-processed-event.repository';
import { PostgresUserDirectoryRepository } from './persistence/postgres-user-directory.repository';

// Aquí se conectan los puertos del dominio con sus adaptadores concretos.
@Module({
  controllers: [UserEventsController, AccountEventsController],
  providers: [
    // Con BREVO_API_KEY se envía por la API de Brevo; si no, por SMTP (nodemailer).
    {
      provide: MAILER,
      useClass: process.env.BREVO_API_KEY
        ? BrevoMailerAdapter
        : NodemailerMailerAdapter,
    },
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PostgresNotificationRepository,
    },
    {
      provide: PROCESSED_EVENT_REPOSITORY,
      useClass: PostgresProcessedEventRepository,
    },
    { provide: USER_DIRECTORY, useClass: PostgresUserDirectoryRepository },
    {
      provide: SendEmailNotificationUseCase,
      useFactory: (
        repository: NotificationRepositoryPort,
        mailer: MailerPort,
      ) => new SendEmailNotificationUseCase(repository, mailer),
      inject: [NOTIFICATION_REPOSITORY, MAILER],
    },
    {
      provide: HandleUserEventUseCase,
      useFactory: (
        processedEvents: ProcessedEventRepositoryPort,
        userDirectory: UserDirectoryPort,
        sendEmail: SendEmailNotificationUseCase,
      ) =>
        new HandleUserEventUseCase(processedEvents, userDirectory, sendEmail),
      inject: [
        PROCESSED_EVENT_REPOSITORY,
        USER_DIRECTORY,
        SendEmailNotificationUseCase,
      ],
    },
    {
      provide: HandleAccountEventUseCase,
      useFactory: (
        processedEvents: ProcessedEventRepositoryPort,
        userDirectory: UserDirectoryPort,
        sendEmail: SendEmailNotificationUseCase,
      ) =>
        new HandleAccountEventUseCase(
          processedEvents,
          userDirectory,
          sendEmail,
        ),
      inject: [
        PROCESSED_EVENT_REPOSITORY,
        USER_DIRECTORY,
        SendEmailNotificationUseCase,
      ],
    },
  ],
})
export class NotificationsModule {}
