import { EmailMessage } from '../domain/email-message';
import { UserEvent } from '../domain/user-event';
import { emailLayout } from './html';

// Arma el correo que corresponde a cada tipo de evento de Users.
// `to` lo pasa el caso de uso, que ya verificó que el evento trae email.
export function buildUserEmail(
  { eventType, payload: user }: UserEvent,
  to: string,
): EmailMessage {
  switch (eventType) {
    case 'USER_CREATED':
      return {
        to,
        subject: 'Tu cuenta ha sido creada',
        body: emailLayout(
          user.name,
          'Tu cuenta ha sido creada exitosamente.',
          [
            ['Nombre', user.name],
            ['Email', user.email],
            ['Rol', user.role],
          ],
          'Ya puedes ingresar a Wallet.',
        ),
      };
    case 'USER_UPDATED':
      return {
        to,
        subject: 'Tu cuenta ha sido actualizada',
        body: emailLayout(
          user.name,
          'Los datos de tu cuenta fueron actualizados.',
          [
            ['Nombre', user.name],
            ['Email', user.email],
            ['Rol', user.role],
            ['Estado', user.status],
          ],
          'Si no reconoces este cambio, contacta al administrador.',
        ),
      };
    case 'USER_DELETED':
      return {
        to,
        subject: 'Tu cuenta ha sido eliminada',
        body: emailLayout(
          user.name,
          'Tu cuenta en Wallet fue eliminada.',
          [
            ['Nombre', user.name],
            ['Email', user.email],
          ],
          'Si crees que se trata de un error, contacta al administrador.',
        ),
      };
  }
}
