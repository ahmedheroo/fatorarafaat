import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { readStoredStoreCode, writeStoredStoreCode } from '../../core/auth-session';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss'
})
export class Auth {
  private authService = inject(AuthService);
  private router = inject(Router);

  mode = signal<'login' | 'register'>('login');

  // login
  storeCode = readStoredStoreCode();
  username = '';
  password = '';
  storeRequired = signal(false);

  // register
  storeName = '';
  registerCode = '';
  ownerName = '';
  phone = '';
  registerUsername = '';
  registerPassword = '';
  registerPasswordConfirm = '';
  adminPassword = '';

  errorMessage = signal('');
  loading = signal(false);

  switchMode(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.errorMessage.set('');
    this.storeRequired.set(false);
  }

  async onLogin(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');

    const result = await this.authService.login(this.username, this.password, this.storeCode.trim());
    this.loading.set(false);

    if (result.success) {
      this.afterLogin();
      return;
    }

    this.storeRequired.set(!!result.storeRequired);
    this.errorMessage.set(result.message);
  }

  async onRegister(): Promise<void> {
    this.errorMessage.set('');

    if (this.registerPassword !== this.registerPasswordConfirm) {
      this.errorMessage.set('كلمتا المرور غير متطابقتين');
      return;
    }

    this.loading.set(true);
    const result = await this.authService.register({
      adminPassword: this.adminPassword,
      storeName: this.storeName.trim(),
      storeCode: this.registerCode.trim(),
      ownerName: this.ownerName.trim(),
      phone: this.phone.trim(),
      username: this.registerUsername.trim(),
      password: this.registerPassword
    });
    this.loading.set(false);

    if (result.success) {
      this.afterLogin();
      return;
    }

    this.errorMessage.set(result.message);
  }

  private afterLogin(): void {
    writeStoredStoreCode(this.authService.tenant()?.slug || this.storeCode.trim());
    this.router.navigate([this.authService.isAdmin() ? '/dashboard' : '/pos']);
  }
}
