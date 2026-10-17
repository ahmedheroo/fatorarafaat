export interface User {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: 'admin' | 'cashier';
  active: boolean;
  createdAt: string;
}

export type CreateUserDto = Omit<User, 'id' | 'createdAt'>;
export type UpdateUserDto = Partial<Omit<User, 'id' | 'createdAt'>>;
