import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { Invoice, InvoiceItem, PaymentMethod } from '../models';
import { CartService } from './cart.service';
import { AuthService } from './auth.service';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private http = inject(HttpClient);
  private cartService = inject(CartService);
  private authService = inject(AuthService);
  private settingsService = inject(SettingsService);

  private readonly _invoices = signal<Invoice[]>([]);
  readonly invoices = this._invoices.asReadonly();

  async loadInvoices(): Promise<void> {
    const invoices = await firstValueFrom(this.http.get<Invoice[]>(`${environment.apiBaseUrl}/api/invoices`));
    this._invoices.set(invoices);
  }

  async completeSale(paymentMethod: PaymentMethod, branchName: string): Promise<Invoice> {
    const items = this.cartService.items();
    const discount = this.cartService.discount();
    const subtotal = this.cartService.subtotal();
    const settings = this.settingsService.settings();
    const currentUser = this.authService.currentUser();

    const taxAmount = Math.round((subtotal - discount) * settings.taxRate / 100 * 100) / 100;
    const total = Math.round((subtotal - discount + taxAmount) * 100) / 100;

    const invoiceItems: InvoiceItem[] = items.map(item => ({
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.product.price,
      total: Math.round(item.product.price * item.quantity * 100) / 100
    }));

    const invoice: Invoice = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 9),
      invoiceNumber: 0,
      items: invoiceItems,
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      taxRate: settings.taxRate,
      taxAmount,
      total,
      paymentMethod,
      cashierName: currentUser?.displayName ?? 'غير معروف',
      branchName,
      createdAt: new Date().toISOString()
    };

    const saved = await firstValueFrom(this.http.post<Invoice>(`${environment.apiBaseUrl}/api/invoices`, invoice));
    this._invoices.update(list => [saved, ...list]);
    this.cartService.clear();
    return saved;
  }

  getInvoiceById(id: string): Invoice | undefined {
    return this._invoices().find(inv => inv.id === id);
  }

  searchInvoices(query: string): Invoice[] {
    const q = query.trim();
    if (!q) return this._invoices();
    return this._invoices().filter(inv =>
      inv.invoiceNumber.toString().includes(q)
    );
  }

  getTodaySales(): { total: number; count: number } {
    const today = new Date().toDateString();
    const todayInvoices = this._invoices().filter(inv =>
      new Date(inv.createdAt).toDateString() === today
    );
    return {
      total: todayInvoices.reduce((sum, inv) => sum + inv.total, 0),
      count: todayInvoices.length
    };
  }

  getTopProducts(limit: number = 5): { name: string; count: number; total: number }[] {
    const map = new Map<string, { name: string; count: number; total: number }>();
    for (const inv of this._invoices()) {
      for (const item of inv.items) {
        const existing = map.get(item.productId);
        if (existing) {
          existing.count += item.quantity;
          existing.total += item.total;
        } else {
          map.set(item.productId, {
            name: item.productName,
            count: item.quantity,
            total: item.total
          });
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getRecentInvoices(limit: number = 5): Invoice[] {
    return this._invoices().slice(0, limit);
  }
}
