import { HandleAccountEventUseCase } from '../../application/handle-account-event.use-case';
import { HandleUserEventUseCase } from '../../application/handle-user-event.use-case';
import { SendEmailNotificationUseCase } from '../../application/send-email-notification.use-case';
import { MailerPort } from '../../domain/ports/mailer.port';
import { NotificationRepositoryPort } from '../../domain/ports/notification-repository.port';
import { AccountEventListener } from './account-event.listener';
import { ListenerLogger } from './delivery-logging';
import { UserEventListener } from './user-event.listener';
import {
  InMemoryProcessedEvents,
  InMemoryUserDirectory,
} from './testing/in-memory-fakes';

const userCreated = {
  eventId: 'user-evt-1',
  eventType: 'USER_CREATED',
  occurredAt: '2026-10-11T23:00:00Z',
  aggregateId: 'u-1',
  payload: {
    id: 'u-1',
    name: 'Daniel',
    email: 'daniel@example.com',
    role: 'MEMBER',
  },
};

// Igual al evento real publicado por Accounts
const accountCreated = {
  eventId: 'd00dc5af-dad1-4106-ac94-5a6d2f10f8f7',
  eventType: 'ACCOUNT_CREATED',
  occurredAt: '2026-10-11T23:34:35.378Z',
  aggregateId: '2',
  payload: {
    accountId: '2',
    userId: 'u-1',
    balance: 0.0,
    currency: 'COP',
    status: 'ACTIVE',
  },
};

describe('AccountEventListener', () => {
  let mailer: jest.Mocked<MailerPort>;
  let logs: string[];
  let users: UserEventListener;
  let accounts: AccountEventListener;

  beforeEach(() => {
    mailer = { send: jest.fn().mockResolvedValue(undefined) };
    const notifications: NotificationRepositoryPort = {
      create: jest.fn().mockResolvedValue(1),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    logs = [];
    const logger: ListenerLogger = {
      log: (m) => logs.push(m),
      warn: (m) => logs.push(m),
      error: (m) => logs.push(m),
    };

    // Mismo directorio e idempotencia compartidos, como en la app real
    const processed = new InMemoryProcessedEvents();
    const directory = new InMemoryUserDirectory();
    const sendEmail = new SendEmailNotificationUseCase(notifications, mailer);
    users = new UserEventListener(
      new HandleUserEventUseCase(processed, directory, sendEmail),
      logger,
    );
    accounts = new AccountEventListener(
      new HandleAccountEventUseCase(processed, directory, sendEmail),
      logger,
    );
  });

  it('ACCOUNT_CREATED envía "cuenta lista" al email del usuario dueño de la cuenta', async () => {
    await users.handle(userCreated, 'users.created');
    mailer.send.mockClear();

    await accounts.handle(accountCreated, 'accounts.created');

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const email = mailer.send.mock.calls[0][0];
    expect(email.to).toBe('daniel@example.com');
    expect(email.subject).toBe('Tu cuenta Wallet está lista');
    expect(email.body).toContain('Daniel');
    expect(email.body).toContain('COP');
    expect(email.body).toContain('ACTIVE');
  });

  it('acepta ids numéricos y saldo como texto', async () => {
    await users.handle(userCreated, 'users.created');
    mailer.send.mockClear();

    await accounts.handle(
      {
        ...accountCreated,
        aggregateId: 7,
        payload: {
          ...accountCreated.payload,
          accountId: 7,
          balance: '1500.50',
        },
      },
      'accounts.created',
    );

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send.mock.calls[0][0].body).toContain('7');
  });

  it('es idempotente por eventId', async () => {
    await users.handle(userCreated, 'users.created');
    mailer.send.mockClear();

    await accounts.handle(accountCreated, 'accounts.created');
    await accounts.handle(accountCreated, 'accounts.created');

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.includes('duplicado'))).toBe(true);
  });

  it('si el usuario no está en el directorio no envía y avisa sin PII', async () => {
    await accounts.handle(accountCreated, 'accounts.created');

    expect(mailer.send).not.toHaveBeenCalled();
    expect(
      logs.some(
        (l) => l.includes('sin contacto') && l.includes(accountCreated.eventId),
      ),
    ).toBe(true);
  });

  it('descarta eventos inválidos', async () => {
    await accounts.handle(
      { ...accountCreated, payload: { accountId: '2' } },
      'accounts.created',
    );

    expect(mailer.send).not.toHaveBeenCalled();
    expect(logs.some((l) => l.includes('payload.userId'))).toBe(true);
  });
});
