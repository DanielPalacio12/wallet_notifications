// Datos de contacto de un usuario, tomados de los eventos de Users.
export interface UserContact {
  userId: string;
  name?: string;
  email: string;
}

// Puerto de salida: proyección local userId -> contacto.
// Se alimenta con users.created / users.updated y se consulta al llegar eventos
// de otros servicios (p. ej. Accounts) que solo traen el userId.
export interface UserDirectoryPort {
  save(contact: UserContact): Promise<void>;
  findById(userId: string): Promise<UserContact | null>;
}

export const USER_DIRECTORY = Symbol('UserDirectoryPort');
