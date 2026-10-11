import { EmailMessage } from './email-message';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export class Notification {
  private constructor(
    private _id: number | null,
    public readonly toEmail: string,
    public readonly subject: string,
    public readonly body: string,
    public readonly topic: string | null,
    private _status: NotificationStatus,
    private _sentAt: Date | null,
    private _errorMessage: string | null,
  ) {}

  static create(message: EmailMessage, topic: string | null): Notification {
    return new Notification(
      null,
      message.to,
      message.subject,
      message.body,
      topic,
      'PENDING',
      null,
      null,
    );
  }

  get id() {
    return this._id;
  }

  get status() {
    return this._status;
  }

  get sentAt() {
    return this._sentAt;
  }

  get errorMessage() {
    return this._errorMessage;
  }

  assignId(id: number) {
    if (this._id !== null) throw new Error('La notificación ya tiene id');
    this._id = id;
  }

  markSent(at: Date = new Date()) {
    this._status = 'SENT';
    this._sentAt = at;
    this._errorMessage = null;
  }

  markFailed(reason: string) {
    this._status = 'FAILED';
    this._sentAt = null;
    this._errorMessage = reason;
  }
}
