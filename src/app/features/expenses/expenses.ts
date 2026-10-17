import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ExpenseService } from '../../core/services/expense.service';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';
import { ArabicDatePipe } from '../../shared/pipes/date.pipe';
import { ToastService } from '../../core/services/toast.service';
import { Expense } from '../../core/models';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule, ArabicDatePipe],
  templateUrl: './expenses.html',
  styleUrl: './expenses.scss'
})
export class Expenses implements OnInit {
  private expenseService = inject(ExpenseService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  expenses = signal<Expense[]>([]);
  branches = signal<{ id: string; name: string }[]>([]);
  showAddModal = false;
  newExpense = {
    title: '',
    amount: 0,
    branchId: '',
    description: ''
  };

  ngOnInit(): void {
    if (!this.auth.isAdmin()) {
      this.router.navigate(['/pos']);
      return;
    }
    this.loadData();
  }

  loadData(): void {
    this.expenseService.getExpenses().subscribe({
      next: (data) => this.expenses.set(data),
      error: () => {}
    });
    this.expenseService.getActiveBranches().subscribe({
      next: (data) => this.branches.set(data),
      error: () => {}
    });
  }

  canSave(): boolean {
    return !!(this.newExpense.title && this.newExpense.amount > 0 && this.newExpense.branchId);
  }

  async saveExpense(): Promise<void> {
    if (!this.canSave()) return;
    const branch = this.branches().find(b => b.id === this.newExpense.branchId);
    try {
      await this.expenseService.addExpense({
        title: this.newExpense.title,
        amount: this.newExpense.amount,
        branchId: this.newExpense.branchId,
        branchName: branch?.name ?? '',
        description: this.newExpense.description
      }).toPromise();
      this.showAddModal = false;
      this.newExpense = { title: '', amount: 0, branchId: '', description: '' };
      this.loadData();
      this.toast.success('تم إضافة المصروف بنجاح');
    } catch {
      this.toast.error('فشل إضافة المصروف');
    }
  }

  async deleteExpense(id: string): Promise<void> {
    try {
      await this.expenseService.deleteExpense(id).toPromise();
      this.loadData();
      this.toast.success('تم الحذف بنجاح');
    } catch {
      this.toast.error('فشل الحذف');
    }
  }
}
