import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InvoiceService } from '../../core/services/invoice.service';
import { Invoice } from '../../core/models';
import { ArabicDatePipe } from '../../shared/pipes/date.pipe';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [RouterLink, FormsModule, ArabicDatePipe],
  templateUrl: './invoice-list.html',
  styles: ['.search-section { margin-bottom: 1.5rem; } .search-section input { max-width: 400px; } .pagination { display: flex; gap: 0.4rem; justify-content: center; margin-top: 1rem; } .pagination button { padding: 0.4rem 0.7rem; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; color: #374151; font-size: 0.85rem; } .pagination button.active { background: #3b82f6; color: #fff; border-color: #3b82f6; } .pagination button:disabled { opacity: 0.4; cursor: not-allowed; } .pagination .info { padding: 0.4rem 0.7rem; font-size: 0.85rem; color: #6b7280; display: flex; align-items: center; gap: 0.4rem; }']
})
export class InvoiceList implements OnInit {
  private invoiceService = inject(InvoiceService);
  searchQuery = '';
  page = signal(1);
  pageSize = 15;
  totalItems = signal(0);
  filteredInvoices = signal<Invoice[]>([]);

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems() / this.pageSize));
  }

  get currentPageData(): Invoice[] {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredInvoices().slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const current = this.page();
    const delta = 2;
    const pages: number[] = [];
    for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
      pages.push(i);
    }
    return pages;
  }

  ngOnInit(): void {
    this.filteredInvoices.set(this.invoiceService.invoices());
    this.totalItems.set(this.filteredInvoices().length);
  }

  filterInvoices(): void {
    this.filteredInvoices.set(this.invoiceService.searchInvoices(this.searchQuery));
    this.totalItems.set(this.filteredInvoices().length);
    this.page.set(1);
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages) {
      this.page.set(p);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
