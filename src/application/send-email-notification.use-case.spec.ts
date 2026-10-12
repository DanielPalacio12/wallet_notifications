import { MailerPort } from '../domain/ports/mailer.port';
import { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';
import { SendEmailNotificationUseCase } from './send-email-notification.use-case';

const message = { to: 'a@b.com', subject: 'Hola', body: '<b>Prueba</b>' };

describe('SendEmailNotificationUseCase', () => {
  let repository: jest.Mocked<NotificationRepositoryPort>;
  let mailer: jest.Mocked<MailerPort>;
  let useCase: SendEmailNotificationUseCase;

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(1),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    mailer = { send: jest.fn().mockResolvedValue(undefined) };
    useCase = new SendEmailNotificationUseCase(repository, mailer);
  });

  it('guarda, envía y marca la notificación como SENT', async () => {
    const { notification, deliveryError } = await useCase.execute(
      message,
      'email.notifications',
    );

    expect(mailer.send).toHaveBeenCalledWith(message);
    expect(deliveryError).toBeUndefined();
    expect(notification.id).toBe(1);
    expect(notification.status).toBe('SENT');
    expect(repository.updateStatus).toHaveBeenCalledWith(notification);
  });

  it('marca FAILED cuando falla el envío', async () => {
    mailer.send.mockRejectedValue(new Error('smtp down'));

    const { notification, deliveryError } = await useCase.execute(
      message,
      null,
    );

    expect(deliveryError).toBeInstanceOf(Error);
    expect(notification.status).toBe('FAILED');
    expect(notification.errorMessage).toBe('smtp down');
    expect(repository.updateStatus).toHaveBeenCalledWith(notification);
  });

  it('envía el correo aunque falle la base de datos', async () => {
    repository.create.mockRejectedValue(new Error('db down'));

    const { notification, persistenceError } = await useCase.execute(
      message,
      null,
    );

    expect(persistenceError).toBeInstanceOf(Error);
    expect(mailer.send).toHaveBeenCalled();
    expect(notification.status).toBe('SENT');
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });
});
