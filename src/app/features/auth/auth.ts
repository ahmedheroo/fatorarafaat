import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

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
  username = '';
  password = '';
  errorMessage = signal('');
  loading = signal(false);

  async onLogin(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    const result = await this.authService.login(this.username, this.password);
    this.loading.set(false);
    if (result.success) {
      if (this.authService.isAdmin()) {
        this.router.navigate(['/dashboard']);
      } else {
        this.router.navigate(['/pos']);
      }
    } else {
      this.errorMessage.set(result.message);
    }
  }
}
