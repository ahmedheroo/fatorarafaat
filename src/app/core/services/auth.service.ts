import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import {
  AuthSession,
  clearSession,
  readSession,
  readStoredStoreCode,
  writeSession,
  writeStoredStoreCode
} from '../auth-session';
import { RegisterTenantDto, Tenant, User } from '../models';

export interface LoginResult {
  success: boolean;
  message: string;
  /** True when the username exists in several stores and a store code is needed. */
  storeRequired?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly _session = signal<AuthSession | null>(readSession());

  readonly session = this._session.asReadonly();
  readonly currentUser = computed<User | null>(() => this._session()?.user ?? null);
  readonly tenant = computed<Tenant | null>(() => this._session()?.tenant ?? null);
  readonly token = computed<string | null>(() => this._session()?.token ?? null);
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly isAdmin = computed(() => this._session()?.user.role === 'admin');

  /** Store code the user last signed in with (convenience for the login screen). */
  readonly lastStoreCode = readStoredStoreCode();

  private persist(session: AuthSession): void {
    writeSession(session);
    this._session.set(session);
  }

  async login(username: string, password: string, storeCode = ''): Promise<LoginResult> {
    try {
      const session = await firstValueFrom(
        this.http.post<AuthSession>(`${environment.apiBaseUrl}/api/auth/login`, {
          username,
          password,
          storeCode
        })
      );
      this.persist(session);
      writeStoredStoreCode(storeCode || session.tenant.slug);
      return { success: true, message: 'تم تسجيل الدخول بنجاح' };
    } catch (err: any) {
      const body = err?.error || {};
      if (body.code === 'STORE_REQUIRED') {
        return { success: false, message: body.message, storeRequired: true };
      }
      return {
        success: false,
        message: body.message || 'تعذر الاتصال بالخادم، حاول مرة أخرى'
      };
    }
  }

  async register(data: RegisterTenantDto): Promise<LoginResult & { field?: string }> {
    try {
      const session = await firstValueFrom(
        this.http.post<AuthSession>(`${environment.apiBaseUrl}/api/auth/register`, data)
      );
      this.persist(session);
      writeStoredStoreCode(session.tenant.slug);
      return { success: true, message: 'تم إنشاء المتجر بنجاح' };
    } catch (err: any) {
      const body = err?.error || {};
      return {
        success: false,
        message: body.message || 'تعذر إنشاء المتجر، حاول مرة أخرى',
        field: body.field
      };
    }
  }

  logout(): void {
    clearSession();
    this._session.set(null);
  }

  async getUsersList(): Promise<User[]> {
    const users = await firstValueFrom(
      this.http.get<User[]>(`${environment.apiBaseUrl}/api/users`)
    );
    return users.filter((u) => u.active);
  }

  async getAllUsers(): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`${environment.apiBaseUrl}/api/users`));
  }

  async createUser(
    userData: Omit<User, 'id' | 'createdAt' | 'password' | 'tenantId'> & { password?: string }
  ): Promise<User> {
    return firstValueFrom(this.http.post<User>(`${environment.apiBaseUrl}/api/users`, userData));
  }

  async updateUser(id: string, data: Partial<User> & { password?: string }): Promise<User> {
    const updated = await firstValueFrom(
      this.http.put<User>(`${environment.apiBaseUrl}/api/users/${id}`, data)
    );
    const current = this._session();
    if (current && current.user.id === id) {
      this.persist({ ...current, user: updated });
    }
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${environment.apiBaseUrl}/api/users/${id}`));
  }
}
