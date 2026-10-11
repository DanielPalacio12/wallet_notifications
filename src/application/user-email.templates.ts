import { EmailMessage } from '../domain/email-message';
import { UserEvent, UserSnapshot } from '../domain/user-event';

// Los datos vienen de otro servicio: se escapan para no inyectar HTML en el correo.
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const layout = (
  user: UserSnapshot,
  intro: string,
  fields: Array<[string, string | undefined]>,
  closing: string,
) => {
  const items = fields
    .filter(([, value]) => value)
    .map(([label, value]) => `<li><b>${label}:</b> ${escapeHtml(value!)}</li>`)
    .join('');

  return `
<div style="font-family: Arial, sans-serif; color: #222;">
  <h2>Hola${user.name ? `, ${escapeHtml(user.name)}` : ''}</h2>
  <p>${intro}</p>
  <ul>${items}</ul>
  <p>${closing}</p>
</div>`.trim();
};

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
        body: layout(
          user,
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
        body: layout(
          user,
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
        body: layout(
          user,
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
