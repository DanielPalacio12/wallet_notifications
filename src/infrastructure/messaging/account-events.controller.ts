import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { HandleAccountEventUseCase } from '../../application/handle-account-event.use-case';
import { AccountEventListener } from './account-event.listener';

export const ACCOUNT_TOPICS = {
  created: 'accounts.created',
} as const;

// Adaptador de entrada: suscribe los tópicos de Accounts y delega en AccountEventListener.
@Controller()
export class AccountEventsController {
  private readonly listener: AccountEventListener;

  constructor(handleAccountEvent: HandleAccountEventUseCase) {
    this.listener = new AccountEventListener(
      handleAccountEvent,
      new Logger(AccountEventsController.name),
    );
  }

  @EventPattern(ACCOUNT_TOPICS.created)
  onAccountCreated(@Payload() payload: unknown) {
    return this.listener.handle(payload, ACCOUNT_TOPICS.created);
  }
}
