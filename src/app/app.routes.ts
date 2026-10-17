import { Routes } from '@angular/router';
import { authGuard, loginGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', canActivate: [loginGuard], loadComponent: () => import('./features/auth/auth').then(m => m.Auth) },
  {
    path: '', canActivate: [authGuard], loadComponent: () => import('./features/layout/layout').then(m => m.Layout),
    children: [
      { path: '', redirectTo: 'pos', pathMatch: 'full' },
      { path: 'pos', loadComponent: () => import('./features/pos/pos').then(m => m.Pos) },
      // Admin-only routes
      { path: 'dashboard', canActivate: [adminGuard], loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'products', canActivate: [adminGuard], loadComponent: () => import('./features/products/product-list').then(m => m.ProductList) },
      { path: 'products/new', canActivate: [adminGuard], loadComponent: () => import('./features/products/product-form').then(m => m.ProductForm) },
      { path: 'products/:id/edit', canActivate: [adminGuard], loadComponent: () => import('./features/products/product-form').then(m => m.ProductForm) },
      { path: 'invoices', canActivate: [adminGuard], loadComponent: () => import('./features/invoices/invoice-list').then(m => m.InvoiceList) },
      { path: 'invoices/:id', canActivate: [adminGuard], loadComponent: () => import('./features/invoices/invoice-detail').then(m => m.InvoiceDetail) },
      { path: 'users', canActivate: [adminGuard], loadComponent: () => import('./features/users/user-list').then(m => m.UserList) },
      { path: 'users/new', canActivate: [adminGuard], loadComponent: () => import('./features/users/user-form').then(m => m.UserForm) },
      { path: 'users/:id/edit', canActivate: [adminGuard], loadComponent: () => import('./features/users/user-form').then(m => m.UserForm) },
      { path: 'settings', canActivate: [adminGuard], loadComponent: () => import('./features/settings/settings').then(m => m.SettingsPage) },
      { path: 'expenses', canActivate: [adminGuard], loadComponent: () => import('./features/expenses/expenses').then(m => m.Expenses) },
      { path: 'reports', canActivate: [adminGuard], loadComponent: () => import('./features/reports/reports').then(m => m.Reports) },
    ]
  },
  { path: '**', redirectTo: '' }
];
