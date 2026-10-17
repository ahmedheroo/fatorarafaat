import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './shared/components/toast/toast';
import { AuthService } from './core/services/auth.service';
import { ProductService } from './core/services/product.service';
import { SettingsService } from './core/services/settings.service';
import { InvoiceService } from './core/services/invoice.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Toast],
  template: '<router-outlet /><app-toast />'
})
export class App implements OnInit {
  private authService = inject(AuthService);
  private productService = inject(ProductService);
  private settingsService = inject(SettingsService);
  private invoiceService = inject(InvoiceService);

  async ngOnInit(): Promise<void> {
    await this.settingsService.loadSettings();
    await this.authService.seedDefaultData();
    await this.productService.seedDefaultProducts();
    await this.productService.loadProducts();
    await this.invoiceService.loadInvoices();
  }
}
