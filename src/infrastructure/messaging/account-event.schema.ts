import { z } from 'zod';

// Ids numéricos o texto: se normalizan a texto
const id = z.union([z.string().min(1), z.number()]).transform(String);

// Contrato del envelope que publica Accounts en accounts.created.
// Los campos que no estén aquí se ignoran, así Accounts puede agregar campos sin romper nada.
export const AccountEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.literal('ACCOUNT_CREATED'),
  occurredAt: z.string().min(1),
  aggregateId: id,
  payload: z.object({
    accountId: id,
    accountNumber: id.optional(),
    userId: id,
    // Puede llegar como número o como texto ("0.00")
    balance: z.coerce.number(),
    currency: z.string().min(1),
    status: z.string().optional(),
  }),
});
