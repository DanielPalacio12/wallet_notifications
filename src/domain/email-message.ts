// "Mensaje nuevo de email" (Paso-3) tal como lo entiende el dominio.
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}
