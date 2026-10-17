import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { User } from '../../core/models';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [RouterLink, ConfirmDialog],
  templateUrl: './user-list.html',
  styles: []
})
export class UserList implements OnInit {
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  users = signal<User[]>([]);
  showDeleteDialog = signal(false);
  userToDelete: User | null = null;

  async ngOnInit(): Promise<void> {
    const allUsers = await this.authService.getAllUsers();
    this.users.set(allUsers);
  }

  confirmDelete(user: User): void {
    this.userToDelete = user;
    this.showDeleteDialog.set(true);
  }

  async onDelete(): Promise<void> {
    if (this.userToDelete) {
      await this.authService.deleteUser(this.userToDelete.id);
      this.toast.success('تم حذف المستخدم');
      const allUsers = await this.authService.getAllUsers();
      this.users.set(allUsers);
    }
    this.showDeleteDialog.set(false);
  }
}
