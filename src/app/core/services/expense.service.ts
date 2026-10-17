import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Expense } from '../models';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  getExpenses() {
    return this.http.get<Expense[]>(`${this.base}/api/expenses`);
  }

  addExpense(data: { title: string; amount: number; branchId: string; branchName: string; description: string }) {
    return this.http.post<Expense>(`${this.base}/api/expenses`, data);
  }

  deleteExpense(id: string) {
    return this.http.delete(`${this.base}/api/expenses/${id}`);
  }

  getActiveBranches() {
    return this.http.get<{ id: string; name: string }[]>(`${this.base}/api/branches`);
  }
}
