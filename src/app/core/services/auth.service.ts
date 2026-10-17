import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { User } from '../models';

const AUTH_KEY = 'pos_current_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly _currentUser = signal<User | null>(this.loadUser());
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isAdmin = computed(() => this._currentUser()?.role === 'admin');

  private loadUser(): User | null {
    try {
      const data = localStorage.getItem(AUTH_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async login(username: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await firstValueFrom(
        this.http.post<User>(`${environment.apiBaseUrl}/api/users/login`, { username, password })
      );
      this._currentUser.set(user);
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
      return { success: true, message: 'تم تسجيل الدخول بنجاح' };
    } catch (err: any) {
      const message = err?.error?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة';
      return { success: false, message };
    }
  }

  logout(): void {
    this._currentUser.set(null);
    localStorage.removeItem(AUTH_KEY);
  }

  async getUsersList(): Promise<User[]> {
    const users = await firstValueFrom(this.http.get<User[]>(`${environment.apiBaseUrl}/api/users`));
    return users.filter(u => u.active);
  }

  async getAllUsers(): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`${environment.apiBaseUrl}/api/users`));
  }

  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'password'> & { password?: string }): Promise<User> {
    return firstValueFrom(this.http.post<User>(`${environment.apiBaseUrl}/api/users`, userData));
  }

  async updateUser(id: string, data: Partial<User> & { password?: string }): Promise<User> {
    const updated = await firstValueFrom(this.http.put<User>(`${environment.apiBaseUrl}/api/users/${id}`, data));
    const current = this._currentUser();
    if (current?.id === id) {
      this._currentUser.set(updated);
      localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
    }
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${environment.apiBaseUrl}/api/users/${id}`));
  }

  async seedDefaultData(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/api/users/seed`, {}));
    } catch {
      // Server might not be running yet
    }
  }
}
