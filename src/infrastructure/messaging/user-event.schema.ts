import { z } from 'zod';

// Contrato del envelope que publica Users en users.created / updated / deleted.
export const UserEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.enum(['USER_CREATED', 'USER_UPDATED', 'USER_DELETED']),
  occurredAt: z.string().min(1),
  aggregateId: z.string().min(1),
  payload: z.object({
    id: z.string().min(1),
    // Opcionales: USER_DELETED llega solo con el id. Sin email no se envía correo.
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    // Texto libre para no descartar eventos si Users agrega roles o estados nuevos
    role: z.string().optional(),
    status: z.string().optional(),
  }),
});
