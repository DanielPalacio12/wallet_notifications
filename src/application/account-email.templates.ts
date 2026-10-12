import { AccountSnapshot } from '../domain/account-event';
import { EmailMessage } from '../domain/email-message';
import { UserContact } from '../domain/ports/user-directory.port';
import { emailLayout } from './html';

const formatBalance = (amount: number, currency: string) => {
  try {
    return amount.toLocaleString('es-CO', { style: 'currency', currency });
  } catch {
    // Código de moneda desconocido: se muestra tal cual
    return `${amount} ${currency}`;
  }
};

// Correo "Tu cuenta Wallet está lista" (ACCOUNT_CREATED).
export function buildAccountCreatedEmail(
  account: AccountSnapshot,
  contact: UserContact,
): EmailMessage {
  return {
    to: contact.email,
    subject: 'Tu cuenta Wallet está lista',
    body: emailLayout(
      contact.name,
      'Tu cuenta en Wallet fue creada y ya puedes empezar a usarla.',
      [
        // accountId es el id interno; el número de cuenta solo si Accounts lo envía
        account.accountNumber
          ? ['Número de cuenta', account.accountNumber]
          : ['Id de cuenta', account.accountId],
        ['Moneda', account.currency],
        ['Saldo inicial', formatBalance(account.balance, account.currency)],
        ['Estado', account.status],
      ],
      'Gracias por usar Wallet.',
    ),
  };
}
