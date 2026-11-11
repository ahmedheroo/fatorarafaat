import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { ProductService } from '../../core/services/product.service';
import { SettingsService } from '../../core/services/settings.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { Toast } from '../../shared/components/toast/toast';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Toast],
  templateUrl: './layout.html',
  styleUrl: './layout.scss'
})
export class Layout implements OnInit {
  authService = inject(AuthService);
  cartService = inject(CartService);
  private productService = inject(ProductService);
  private settingsService = inject(SettingsService);
  private invoiceService = inject(InvoiceService);
  private router = inject(Router);

  sidebarCollapsed = signal(false);
  /** Child pages read the shared signals on init, so the tenant data loads first. */
  readonly ready = signal(false);

  readonly tenantName = computed(() => this.authService.tenant()?.name || 'نقطة البيع');

  allNavItems = [
    { icon: 'fas fa-home', label: 'الرئيسية', route: '/dashboard', exact: true, adminOnly: true },
    { icon: 'fas fa-cash-register', label: 'نقطة البيع', route: '/pos', exact: false, adminOnly: false },
    { icon: 'fas fa-box-open', label: 'المنتجات', route: '/products', exact: false, adminOnly: true },
    { icon: 'fas fa-file-invoice-dollar', label: 'الفواتير', route: '/invoices', exact: false, adminOnly: true },
    { icon: 'fas fa-users', label: 'المستخدمين', route: '/users', exact: false, adminOnly: true },
    // { icon: 'fas fa-wallet', label: 'المصروفات', route: '/expenses', exact: false, adminOnly: true },
    //{ icon: 'fas fa-chart-bar', label: 'التقارير', route: '/reports', exact: false, adminOnly: true },
    { icon: 'fas fa-cog', label: 'الاعدادات', route: '/settings', exact: false, adminOnly: true },
  ];

  allMobileNavItems = [
    { icon: 'fas fa-home', label: 'الرئيسية', route: '/dashboard', exact: true, adminOnly: true },
    { icon: 'fas fa-cash-register', label: 'نقطة البيع', route: '/pos', exact: false, adminOnly: false },
    { icon: 'fas fa-box-open', label: 'المنتجات', route: '/products', exact: false, adminOnly: true },
    { icon: 'fas fa-file-invoice-dollar', label: 'الفواتير', route: '/invoices', exact: false, adminOnly: true },
    // { icon: 'fas fa-wallet', label: 'المصروفات', route: '/expenses', exact: false, adminOnly: true },
   // { icon: 'fas fa-chart-bar', label: 'التقارير', route: '/reports', exact: false, adminOnly: true },
    { icon: 'fas fa-cog', label: 'الاعدادات', route: '/settings', exact: false, adminOnly: true },
  ];

  navItems = computed(() => {
    if (this.authService.isAdmin()) {
      return this.allNavItems;
    }
    return this.allNavItems.filter(item => !item.adminOnly);
  });

  mobileNavItems = computed(() => {
    if (this.authService.isAdmin()) {
      return this.allMobileNavItems;
    }
    return this.allMobileNavItems.filter(item => !item.adminOnly);
  });

  async ngOnInit(): Promise<void> {
    // Every request is scoped by the session token, so one load serves this tenant only.
    try {
      await Promise.all([
        this.settingsService.loadSettings(),
        this.productService.loadProducts(),
        this.invoiceService.loadInvoices()
      ]);
    } catch {
      // Expired sessions are handled by the HTTP interceptor (redirect to login).
    } finally {
      this.ready.set(true);
    }
  }

  toggleSidebar(): void { this.sidebarCollapsed.update(v => !v); }
  logout(): void { this.authService.logout(); this.router.navigate(['/login']); }
}
