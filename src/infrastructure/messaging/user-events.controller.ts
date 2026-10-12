import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { HandleUserEventUseCase } from '../../application/handle-user-event.use-case';
import { UserEventListener } from './user-event.listener';

export const USER_TOPICS = {
  created: 'users.created',
  updated: 'users.updated',
  deleted: 'users.deleted',
} as const;

// Adaptador de entrada: suscribe los tópicos de Users y delega en UserEventListener.
@Controller()
export class UserEventsController {
  private readonly listener: UserEventListener;

  constructor(handleUserEvent: HandleUserEventUseCase) {
    this.listener = new UserEventListener(
      handleUserEvent,
      new Logger(UserEventsController.name),
    );
  }

  @EventPattern(USER_TOPICS.created)
  onUserCreated(@Payload() payload: unknown) {
    return this.listener.handle(payload, USER_TOPICS.created);
  }

  @EventPattern(USER_TOPICS.updated)
  onUserUpdated(@Payload() payload: unknown) {
    return this.listener.handle(payload, USER_TOPICS.updated);
  }

  @EventPattern(USER_TOPICS.deleted)
  onUserDeleted(@Payload() payload: unknown) {
    return this.listener.handle(payload, USER_TOPICS.deleted);
  }
}
