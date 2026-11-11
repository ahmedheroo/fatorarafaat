import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { Settings, Branch } from '../../core/models';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_SIDE = 400;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings.html',
  styles: [`
    .logo-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .logo-preview { margin-top: 0.5rem; }
    .logo-preview img { max-width: 150px; max-height: 80px; border-radius: 8px; border: 1px solid #e5e7eb; }
    .logo-error { color: #ef4444; font-size: 0.8rem; margin-top: 0.25rem; }
    .branch-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid #f3f4f6; }
    .branch-info { flex: 1; display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .branch-name-input { flex: 2; min-width: 150px; }
    .branch-addr-input { flex: 3; min-width: 180px; }
    .toggle-label { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; flex-shrink: 0; }
    .toggle-label input { display: none; }
    .toggle-slider { position: absolute; inset: 0; background: #d1d5db; border-radius: 24px; transition: 0.3s; }
    .toggle-label input:checked + .toggle-slider { background: #10b981; }
    .toggle-slider::after { content: ''; position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: 0.3s; }
    .toggle-label input:checked + .toggle-slider::after { right: 22px; }
    .toggle-text { font-size: 0.8rem; color: #6b7280; margin-left: 0.5rem; }
  `]
})
export class SettingsPage implements OnInit {
  private settingsService = inject(SettingsService);
  private toast = inject(ToastService);

  logoError = false;
  logoUploading = false;
  formData: Settings = {
    shopName: '', address: '', phone: '', receiptWidth: '80mm', logoUrl: '', branches: []
  };

  ngOnInit(): void {
    this.formData = { ...this.settingsService.settings() };
  }

  addBranch(): void {
    this.formData.branches.push({
      id: 'branch-' + Date.now(),
      name: '',
      address: '',
      isActive: true
    });
  }

  removeBranch(index: number): void {
    this.formData.branches.splice(index, 1);
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toast.error('الرجاء اختيار ملف صورة');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.toast.error('حجم الصورة كبير، الحد الأقصى 5 ميجابايت');
      return;
    }

    void this.uploadLogo(file);
  }

  async onRemoveLogo(): Promise<void> {
    if (this.logoUploading) return;
    this.logoUploading = true;
    try {
      await this.settingsService.removeLogo();
      this.formData.logoUrl = '';
      this.logoError = false;
      this.toast.success('تم حذف الشعار');
    } catch {
      this.toast.error('تعذر حذف الشعار، حاول مرة أخرى');
    } finally {
      this.logoUploading = false;
    }
  }

  async onSave(): Promise<void> {
    await this.settingsService.updateSettings(this.formData);
    this.toast.success('تم حفظ الإعدادات بنجاح');
  }

  private async uploadLogo(file: File): Promise<void> {
    this.logoUploading = true;
    this.logoError = false;
    try {
      const dataUrl = await this.prepareImage(file);
      await this.settingsService.uploadLogo(dataUrl);
      this.formData.logoUrl = this.settingsService.getSettings().logoUrl;
      this.toast.success('تم رفع شعار المحل بنجاح');
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'تعذر رفع الصورة، حاول مرة أخرى');
    } finally {
      this.logoUploading = false;
    }
  }

  /** Scales the picture down so the stored logo stays small. */
  private async prepareImage(file: File): Promise<string> {
    if (file.type === 'image/svg+xml') {
      return this.readAsDataUrl(file);
    }

    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_LOGO_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) return this.readAsDataUrl(file);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      // PNG keeps transparency in logos; photos become JPEG to stay light.
      const keepsAlpha = file.type === 'image/png' || file.type === 'image/gif';
      return canvas.toDataURL(keepsAlpha ? 'image/png' : 'image/jpeg', 0.85);
    } catch {
      return this.readAsDataUrl(file);
    }
  }

  private readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
