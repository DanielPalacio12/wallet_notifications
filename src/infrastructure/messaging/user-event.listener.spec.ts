import { HandleUserEventUseCase } from '../../application/handle-user-event.use-case';
import { SendEmailNotificationUseCase } from '../../application/send-email-notification.use-case';
import { MailerPort } from '../../domain/ports/mailer.port';
import { NotificationRepositoryPort } from '../../domain/ports/notification-repository.port';
import { ProcessedEventRepositoryPort } from '../../domain/ports/processed-event-repository.port';
import { ListenerLogger, UserEventListener } from './user-event.listener';

// Idempotencia en memoria, con el mismo contrato que la tabla processed_events
class InMemoryProcessedEvents implements ProcessedEventRepositoryPort {
  private readonly ids = new Set<string>();
  async markAsProcessed(eventId: string) {
    if (this.ids.has(eventId)) return false;
    this.ids.add(eventId);
    return true;
  }
}

const userCreated = {
  eventId: '8f14e45f-ceea-467a-9575-6f1d7e2b9c01',
  eventType: 'USER_CREATED',
  occurredAt: '2026-10-10T22:00:00Z',
  aggregateId: 'u-123',
  payload: {
    id: 'u-123',
    name: 'Daniel',
    email: 'daniel@example.com',
    role: 'MEMBER',
    status: 'ACTIVE',
  },
};

describe('UserEventListener', () => {
  let listener: UserEventListener;
  let mailer: jest.Mocked<MailerPort>;
  let logs: string[];

  beforeEach(() => {
    mailer = { send: jest.fn().mockResolvedValue(undefined) };
    const notifications: NotificationRepositoryPort = {
      create: jest.fn().mockResolvedValue(1),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    // Captura todos los logs para comprobar que no incluyen PII
    logs = [];
    const logger: ListenerLogger = {
      log: (m) => logs.push(m),
      warn: (m) => logs.push(m),
      error: (m) => logs.push(m),
    };

    listener = new UserEventListener(
      new HandleUserEventUseCase(
        new InMemoryProcessedEvents(),
        new SendEmailNotificationUseCase(notifications, mailer),
      ),
      logger,
    );
  });

  it('USER_CREATED envía el correo de cuenta creada con name, email y role', async () => {
    await listener.handle(userCreated, 'users.created');

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const email = mailer.send.mock.calls[0][0];
    expect(email.to).toBe('daniel@example.com');
    expect(email.subject).toBe('Tu cuenta ha sido creada');
    expect(email.body).toContain('Daniel');
    expect(email.body).toContain('daniel@example.com');
    expect(email.body).toContain('MEMBER');
  });

  it('es idempotente: dos eventos con el mismo eventId solo envían un correo', async () => {
    await listener.handle(userCreated, 'users.created');
    await listener.handle(userCreated, 'users.created');

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.includes('duplicado'))).toBe(true);
  });

  it('USER_UPDATED incluye el estado y USER_DELETED usa su asunto', async () => {
    await listener.handle(
      {
        ...userCreated,
        eventId: 'e-2',
        eventType: 'USER_UPDATED',
        payload: { ...userCreated.payload, status: 'BLOCKED' },
      },
      'users.updated',
    );
    await listener.handle(
      { ...userCreated, eventId: 'e-3', eventType: 'USER_DELETED' },
      'users.deleted',
    );

    const [updated, deleted] = mailer.send.mock.calls.map(([m]) => m);
    expect(updated.subject).toBe('Tu cuenta ha sido actualizada');
    expect(updated.body).toContain('BLOCKED');
    expect(deleted.subject).toBe('Tu cuenta ha sido eliminada');
  });

  it('USER_DELETED solo con id: no envía correo ni lo trata como inválido', async () => {
    await listener.handle(
      { ...userCreated, eventId: 'e-4', eventType: 'USER_DELETED', payload: { id: 'u-123' } },
      'users.deleted',
    );

    expect(mailer.send).not.toHaveBeenCalled();
    expect(logs.some((l) => l.includes('sin email') && l.includes('e-4'))).toBe(true);
    expect(logs.some((l) => l.includes('inválido'))).toBe(false);
  });

  it('escapa el HTML de los datos del usuario', async () => {
    await listener.handle(
      { ...userCreated, payload: { ...userCreated.payload, name: '<script>x</script>' } },
      'users.created',
    );

    expect(mailer.send.mock.calls[0][0].body).not.toContain('<script>');
  });

  it('no lanza si falla el envío y no loguea el email', async () => {
    mailer.send.mockRejectedValue(new Error('550 mailbox daniel@example.com not found'));

    await expect(listener.handle(userCreated, 'users.created')).resolves.toBeUndefined();

    expect(logs.some((l) => l.includes('FALLIDO') && l.includes(userCreated.eventId))).toBe(true);
    expect(logs.join('\n')).not.toContain('daniel@example.com');
  });

  it('descarta eventos inválidos sin enviar correo ni loguear el valor', async () => {
    await listener.handle(
      { ...userCreated, payload: { ...userCreated.payload, email: 'no-es-email' } },
      'users.created',
    );

    expect(mailer.send).not.toHaveBeenCalled();
    expect(logs.some((l) => l.includes('payload.email'))).toBe(true);
    expect(logs.join('\n')).not.toContain('no-es-email');
  });
});
