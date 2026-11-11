export interface User {
  id: string;
  tenantId?: string;
  username: string;
  /** Never returned by the API; only sent when creating/updating a user. */
  password?: string;
  displayName: string;
  role: 'admin' | 'cashier';
  active: boolean;
  createdAt: string;
}

export type CreateUserDto = Omit<User, 'id' | 'createdAt'>;
export type UpdateUserDto = Partial<Omit<User, 'id' | 'createdAt'>>;
