import { Component, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { User } from '../../core/models';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './user-form.html',
  styles: []
})
export class UserForm implements OnInit {
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isEdit = signal(false);
  userId = '';
  password = '';
  formData: { username: string; displayName: string; role: 'admin' | 'cashier'; active: boolean } = {
    username: '', displayName: '', role: 'cashier', active: true
  };

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.userId = id;
      const users = await this.authService.getAllUsers();
      const user = users.find(u => u.id === id);
      if (user) {
        this.formData = { username: user.username, displayName: user.displayName, role: user.role, active: user.active };
      }
    }
  }

  async onSubmit(): Promise<void> {
    try {
      if (this.isEdit()) {
        const updateData: Partial<User> & { password?: string } = { ...this.formData };
        if (this.password) updateData.password = this.password;
        await this.authService.updateUser(this.userId, updateData);
        this.toast.success('تم تعديل المستخدم');
      } else {
        await this.authService.createUser({ ...this.formData, password: this.password || '123456' });
        this.toast.success('تم إضافة المستخدم');
      }
      this.router.navigate(['/users']);
    } catch (e: unknown) {
      this.toast.error(e instanceof Error ? e.message : 'حدث خطأ');
    }
  }
}
