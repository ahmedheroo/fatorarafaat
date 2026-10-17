import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { InvoiceService } from '../../core/services/invoice.service';
import { ExpenseService } from '../../core/services/expense.service';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { Expense } from '../../core/models';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss'
})
export class Reports implements OnInit {
  private invoiceService = inject(InvoiceService);
  private expenseService = inject(ExpenseService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private settings = inject(SettingsService);
  private toast = inject(ToastService);

  invoices = signal<any[]>([]);
  expenses = signal<Expense[]>([]);
  branches = signal<{ id: string; name: string }[]>([]);
  fromDate = '';
  toDate = '';
  selectedBranchId = '';

  reportRows = signal<any[]>([]);
  summary = signal<any>(null);

  ngOnInit(): void {
    if (!this.auth.isAdmin()) {
      this.router.navigate(['/pos']);
      return;
    }
    this.loadBranches();
    this.loadData();
  }

  ngOnChanges(): void {
    this.loadBranches();
  }

  loadBranches(): void {
    const all = this.settings.settings().branches || [];
    this.branches.set(all.filter((b: any) => b.isActive).map((b: any) => ({ id: b.id, name: b.name })));
  }

  loadData(): void {
    this.invoiceService.loadInvoices().then(() => {
      this.invoices.set(this.invoiceService.invoices());
      this.buildReport();
    });
    this.expenseService.getExpenses().subscribe({
      next: (data: any[]) => {
        this.expenses.set(data);
        this.buildReport();
      },
      error: () => {}
    });
  }

  canExport(): boolean {
    return !!(this.fromDate && this.toDate);
  }

  buildReport(): void {
    const invoices = this.invoices();
    const expenses = this.expenses();
    const from = this.fromDate ? new Date(this.fromDate + 'T00:00:00') : null;
    const to = this.toDate ? new Date(this.toDate + 'T23:59:59') : null;
    const branchId = this.selectedBranchId || '';

    const rows: any[] = [];
    let totalSales = 0;
    let totalExpenses = 0;

    // Invoice rows
    for (const inv of invoices) {
      if (!this.inDateRange(inv.createdAt, from, to)) continue;
      if (branchId && inv.branchName !== this.branchNameFor(branchId)) continue;
      totalSales += inv.total;
      rows.push({
        id: 'inv-' + inv.id,
        date: this.formatDate(inv.createdAt),
        branchName: inv.branchName,
        type: 'sale',
        amount: inv.total,
        note: 'فاتورة #' + inv.invoiceNumber + ' - ' + inv.paymentMethod
      });
    }

    // Expense rows
    for (const exp of expenses) {
      if (!this.inDateRange(exp.createdAt, from, to)) continue;
      if (branchId && exp.branchId !== branchId) continue;
      totalExpenses += exp.amount;
      rows.push({
        id: 'exp-' + exp.id,
        date: this.formatDate(exp.createdAt),
        branchName: exp.branchName,
        type: 'expense',
        amount: -exp.amount,
        note: exp.title + (exp.description ? ' - ' + exp.description : '')
      });
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    this.reportRows.set(rows);
    this.summary.set({
      fromDate: this.fromDate ? this.formatDateLong(this.fromDate) : '-',
      toDate: this.toDate ? this.formatDateLong(this.toDate) : '-',
      branchName: branchId ? this.branchNameFor(branchId) : 'الكل',
      totalSales,
      totalExpenses,
      netProfit: totalSales - totalExpenses
    });
  }

  inDateRange(dateStr: string, from: Date | null, to: Date | null): boolean {
    if (!from && !to) return true;
    const d = new Date(dateStr);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  branchNameFor(id: string): string {
    return this.branches().find(b => b.id === id)?.name ?? '';
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-SA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatDateLong(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('ar-SA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async exportExcel(): Promise<void> {
    if (!this.canExport()) {
      this.toast.error('اختر فترة زمنية أولاً');
      return;
    }

    // Rebuild immediately before exporting so the latest date and branch
    // selections are always reflected, even when the user exports directly
    // after changing a filter.
    this.buildReport();

    import('xlsx').then((mod: any) => {
      const XLSX = mod.default || mod;
      const rows = this.reportRows();
      const s = this.summary();

    const data = [
      ['تقرير المبيعات والمصروفات', '', '', '', ''],
      ['التاريخ من', s?.fromDate ?? '-', '', '', ''],
      ['التاريخ إلى', s?.toDate ?? '-', '', '', ''],
      ['الفرع', s?.branchName ?? '-', '', '', ''],
      ['', '', '', '', ''],
      ['التاريخ', 'الفرع', 'النوع', 'المبلغ (ر.س)', 'ملاحظات'],
      ...rows.map(r => [
        r.date,
        r.branchName,
        r.type === 'sale' ? 'بيع' : 'مصروف',
        r.amount.toFixed(2),
        r.note
      ]),
      ['', '', '', '', ''],
      ['الإجمالي', '', '', s?.totalSales.toFixed(2) + ' ر.س', ''],
      ['إجمالي المصروفات', '', '', '-' + s?.totalExpenses.toFixed(2) + ' ر.س', ''],
      ['صافي الربح', '', '', s?.netProfit.toFixed(2) + ' ر.س', '']
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 40 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
    const fileName = `تقرير_مبيعات_${this.fromDate || 'كل'}_${this.toDate || 'الآن'}.xlsx`;
      XLSX.writeFile(wb, fileName);
      this.toast.success('تم تصدير التقرير بنجاح');
    }).catch(() => {
      this.toast.error('فشل تصدير التقرير');
    });
  }
}
