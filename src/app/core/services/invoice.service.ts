import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { CustomerInfo, Invoice, InvoiceItem, PaymentMethod } from '../models';
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
    this._invoices.set((invoices || []).map(inv => ({
      ...inv,
      customerName: inv.customerName || '',
      customerPhone: inv.customerPhone || '',
      guestsCount: Number(inv.guestsCount) || 0
    })));
  }

  async completeSale(
    paymentMethod: PaymentMethod,
    branchName: string,
    customer: CustomerInfo = {}
  ): Promise<Invoice> {
    const items = this.cartService.items();
    const discount = this.cartService.discount();
    const subtotal = this.cartService.subtotal();
    const currentUser = this.authService.currentUser();

    const total = Math.round((subtotal - discount) * 100) / 100;

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
      total,
      paymentMethod,
      cashierName: currentUser?.displayName ?? 'غير معروف',
      branchName,
      customerName: customer.name?.trim() ?? '',
      customerPhone: customer.phone?.trim() ?? '',
      guestsCount: customer.guests && customer.guests > 0 ? Math.floor(customer.guests) : 0,
      reservedAt: customer.reservedAt || '',
      createdAt: new Date().toISOString()
    };

    const saved = await firstValueFrom(this.http.post<Invoice>(`${environment.apiBaseUrl}/api/invoices`, invoice));
    // Keep the values entered at the till even when an older API build does not
    // echo them back, so the printed receipt shows the chosen reservation date.
    const result: Invoice = {
      ...invoice,
      ...saved,
      branchName: saved.branchName || branchName,
      reservedAt: saved.reservedAt || invoice.reservedAt
    };
    this._invoices.update(list => [result, ...list]);
    this.cartService.clear();
    return result;
  }

  async deleteInvoice(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${environment.apiBaseUrl}/api/invoices/${id}`));
    this._invoices.update(list => list.filter(inv => inv.id !== id));
  }

  getInvoiceById(id: string): Invoice | undefined {
    return this._invoices().find(inv => inv.id === id);
  }

  searchInvoices(query: string): Invoice[] {
    const q = query.trim();
    if (!q) return this._invoices();
    return this._invoices().filter(inv =>
      inv.invoiceNumber.toString().includes(q) ||
      (inv.customerName || '').includes(q) ||
      (inv.customerPhone || '').includes(q)
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
