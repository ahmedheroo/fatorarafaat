import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { Settings, DEFAULT_SETTINGS } from '../models';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);
  private readonly _settings = signal<Settings>({ ...DEFAULT_SETTINGS });
  readonly settings = this._settings.asReadonly();

  async loadSettings(): Promise<void> {
    try {
      const settings = await firstValueFrom(this.http.get<Settings>(`${environment.apiBaseUrl}/api/settings`));
      this._settings.set({ ...DEFAULT_SETTINGS, ...settings });
    } catch {
      this._settings.set({ ...DEFAULT_SETTINGS });
    }
  }

  async updateSettings(data: Partial<Settings>): Promise<void> {
    const updated = await firstValueFrom(this.http.put<Settings>(`${environment.apiBaseUrl}/api/settings`, data));
    this._settings.set({ ...DEFAULT_SETTINGS, ...updated });
  }

  getSettings(): Settings {
    return this._settings();
  }
}
