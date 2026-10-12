import { ProcessedEventRepositoryPort } from '../../../domain/ports/processed-event-repository.port';
import {
  UserContact,
  UserDirectoryPort,
} from '../../../domain/ports/user-directory.port';

// Dobles en memoria para los tests, con el mismo contrato que las tablas reales.

export class InMemoryProcessedEvents implements ProcessedEventRepositoryPort {
  private readonly ids = new Set<string>();
  async markAsProcessed(eventId: string) {
    if (this.ids.has(eventId)) return false;
    this.ids.add(eventId);
    return true;
  }
}

export class InMemoryUserDirectory implements UserDirectoryPort {
  readonly contacts = new Map<string, UserContact>();
  async save(contact: UserContact) {
    this.contacts.set(contact.userId, contact);
  }
  async findById(userId: string) {
    return this.contacts.get(userId) ?? null;
  }
}
