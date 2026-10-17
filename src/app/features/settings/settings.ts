import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { Settings, Branch } from '../../core/models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings.html',
  styles: [`
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
  formData: Settings = {
    shopName: '', address: '', phone: '', taxId: '', taxRate: 15, receiptWidth: '80mm', logoUrl: '', branches: []
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

  async onSave(): Promise<void> {
    await this.settingsService.updateSettings(this.formData);
    this.toast.success('تم حفظ الإعدادات بنجاح');
  }
}
