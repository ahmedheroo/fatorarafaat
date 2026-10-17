import { Component, inject, computed, signal } from '@angular/core';
import { InvoiceService } from '../../core/services/invoice.service';
import { ProductService } from '../../core/services/product.service';
import { ArabicDatePipe } from '../../shared/pipes/date.pipe';
import { Invoice } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ArabicDatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {
  private invoiceService = inject(InvoiceService);
  private productService = inject(ProductService);

  todaySales = computed(() => this.invoiceService.getTodaySales());
  productCount = computed(() => this.productService.getActiveCount());
  recentInvoices = computed(() => this.invoiceService.getRecentInvoices(5));
  topProducts = computed(() => this.invoiceService.getTopProducts(5));
}
