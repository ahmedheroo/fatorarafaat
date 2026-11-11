import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { Settings, DEFAULT_SETTINGS } from '../models';

/** True when the running server does not have the requested route at all. */
function isMissingEndpoint(err: any): boolean {
  const status = err?.status;
  return status === 404 || status === 405 || status === 501;
}

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

  /** Stores an uploaded image and returns the settings with the new logo URL. */
  async uploadLogo(dataUrl: string): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.http.post<Settings>(`${environment.apiBaseUrl}/api/settings/logo`, { dataUrl })
      );
      this._settings.set({ ...DEFAULT_SETTINGS, ...updated });
    } catch (err: any) {
      if (!isMissingEndpoint(err)) throw err;
      // Servers that predate the upload route have no /settings/logo, so the
      // image is kept inside the settings row itself.
      await this.updateSettings({ logoUrl: dataUrl });
    }
  }

  async removeLogo(): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.http.delete<Settings>(`${environment.apiBaseUrl}/api/settings/logo`)
      );
      this._settings.set({ ...DEFAULT_SETTINGS, ...updated });
    } catch (err: any) {
      if (!isMissingEndpoint(err)) throw err;
      await this.updateSettings({ logoUrl: '' });
    }
  }

  getSettings(): Settings {
    return this._settings();
  }
}
