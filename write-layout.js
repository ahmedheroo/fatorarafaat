const fs = require('fs');
const p = 'src/app/features/layout/layout.ts';
const c = `import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { Toast } from '../../shared/components/toast/toast';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Toast],
  template: \`
    <div class="layout">
      <aside class="sidebar" [class.collapsed]="sidebarCollapsed()">
        <div class="sidebar-header">
          <div class="logo">
            <span class="logo-icon">\u{1F4B3}</span>
            @if (!sidebarCollapsed()) {
              <span class="logo-text">\u0646\u0642\u0637\u0629 \u0627\u0644\u0628\u064A\u0639</span>
            }
          </div>
          <button class="sidebar-toggle" (click)="toggleSidebar()">
            {{ sidebarCollapsed() ? '\u2630' : '\u2715' }}
          </button>
        </div>
        <nav class="sidebar-nav">
          @for (item of navItems; track item.route) {
            <a class="nav-item" [routerLink]="item.route" routerLinkActive="active"
               [routerLinkActiveOptions]="{exact: item.exact}">
              <span class="nav-icon">{{ item.icon }}</span>
              @if (!sidebarCollapsed()) {
                <span class="nav-label">{{ item.label }}</span>
              }
              @if (item.route === '/pos' && cartService.itemCount() > 0) {
                <span class="nav-badge">{{ cartService.itemCount() }}</span>
              }
            </a>
          }
        </nav>
        <div class="sidebar-footer">
          @if (!sidebarCollapsed()) {
            <div class="user-info">
              <span class="user-name">{{ authService.currentUser()?.displayName }}</span>
              <span class="user-role">{{ authService.currentUser()?.role === 'admin' ? '\u0645\u062F\u064A\u0631' : '\u0643\u0627\u0634\u064A\u0631' }}</span>
            </div>
          }
          <button class="nav-item logout-btn" (click)="logout()">
            <span class="nav-icon">\u{1F6AA}</span>
            @if (!sidebarCollapsed()) {
              <span class="nav-label">\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C</span>
            }
          </button>
        </div>
      </aside>
      <main class="main-content">
        <router-outlet />
      </main>
      <nav class="mobile-nav">
        @for (item of mobileNavItems; track item.route) {
          <a class="mobile-nav-item" [routerLink]="item.route" routerLinkActive="active"
             [routerLinkActiveOptions]="{exact: item.exact}">
            <span class="mobile-nav-icon">{{ item.icon }}</span>
            <span class="mobile-nav-label">{{ item.label }}</span>
            @if (item.route === '/pos' && cartService.itemCount() > 0) {
              <span class="mobile-badge">{{ cartService.itemCount() }}</span>
            }
          </a>
        }
        <button class="mobile-nav-item" (click)="logout()">
          <span class="mobile-nav-icon">\u{1F6AA}</span>
          <span class="mobile-nav-label">\u062E\u0631\u0648\u062C</span>
        </button>
      </nav>
      <app-toast />
    </div>
  \`,
  styles: [\`
    .layout { display: flex; min-height: 100vh; }
    .sidebar { width: 250px; background: #111827; color: white; display: flex; flex-direction: column; position: fixed; right: 0; top: 0; bottom: 0; z-index: 100; transition: width 0.3s ease; }
    .sidebar.collapsed { width: 70px; }
    .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .logo { display: flex; align-items: center; gap: 0.75rem; }
    .logo-icon { font-size: 1.5rem; }
    .logo-text { font-size: 1.1rem; font-weight: 700; white-space: nowrap; }
    .sidebar-toggle { background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; padding: 0.25rem; border-radius: 6px; opacity: 0.7; }
    .sidebar-toggle:hover { opacity: 1; background: rgba(255,255,255,0.1); }
    .sidebar-nav { flex: 1; padding: 0.75rem 0; overflow-y: auto; }
    .nav-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; color: rgba(255,255,255,0.7); text-decoration: none; font-family: 'Cairo', sans-serif; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; border: none; background: none; width: 100%; text-align: right; }
    .nav-item:hover { background: rgba(255,255,255,0.1); color: white; }
    .nav-item.active { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border-right: 3px solid #3b82f6; }
    .sidebar.collapsed .nav-item { justify-content: center; padding: 0.75rem; }
    .nav-icon { font-size: 1.2rem; min-width: 1.5rem; text-align: center; }
    .nav-label { white-space: nowrap; }
    .nav-badge { background: #ef4444; color: white; border-radius: 10px; padding: 0.1rem 0.45rem; font-size: 0.7rem; font-weight: 700; margin-right: auto; }
    .sidebar-footer { padding: 0.75rem 0; border-top: 1px solid rgba(255,255,255,0.1); }
    .user-info { padding: 0.5rem 1rem; display: flex; flex-direction: column; }
    .user-name { font-weight: 600; font-size: 0.85rem; }
    .user-role { font-size: 0.75rem; opacity: 0.6; }
    .logout-btn { color: #f87171 !important; }
    .logout-btn:hover { background: rgba(239, 68, 68, 0.15) !important; }
    .main-content { flex: 1; margin-right: 250px; padding: 1.5rem; padding-bottom: 2rem; transition: margin-right 0.3s ease; min-height: 100vh; }
    .sidebar.collapsed ~ .main-content { margin-right: 70px; }
    .mobile-nav { display: none; }
    @media (max-width: 1024px) {
      .sidebar { width: 70px; }
      .sidebar .logo-text, .sidebar .nav-label, .sidebar .user-info { display: none; }
      .sidebar .nav-item { justify-content: center; padding: 0.75rem; }
      .main-content { margin-right: 70px; }
    }
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main-content { margin-right: 0; padding: 1rem; padding-bottom: 5rem; }
      .mobile-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e5e7eb; z-index: 100; padding: 0.35rem 0; box-shadow: 0 -2px 10px rgba(0,0,0,0.08); }
      .mobile-nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.15rem; padding: 0.4rem 0; color: #9ca3af; text-decoration: none; font-family: 'Cairo', sans-serif; font-size: 0.65rem; position: relative; background: none; border: none; cursor: pointer; }
      .mobile-nav-item.active { color: #3b82f6; }
      .mobile-nav-icon { font-size: 1.2rem; }
      .mobile-badge { position: absolute; top: 0; right: 50%; transform: translateX(150%); background: #ef4444; color: white; border-radius: 8px; padding: 0.05rem 0.35rem; font-size: 0.6rem; font-weight: 700; }
    }
  \`]
})
export class Layout {
  authService = inject(AuthService);
  cartService = inject(CartService);
  private router = inject(Router);
  sidebarCollapsed = signal(false);
  navItems = [
    { icon: '\u{1F3E0}', label: '\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629', route: '/dashboard', exact: true },
    { icon: '\u{1F4B3}', label: '\u0646\u0642\u0637\u0629 \u0627\u0644\u0628\u064A\u0639', route: '/pos', exact: false },
    { icon: '\u{1F4E6}', label: '\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A', route: '/products', exact: false },
    { icon: '\u{1F9FE}', label: '\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631', route: '/invoices', exact: false },
    { icon: '\u{1F465}', label: '\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u0648\u0646', route: '/users', exact: false },
    { icon: '\u2699\uFE0F', label: '\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A', route: '/settings', exact: false },
  ];
  mobileNavItems = [
    { icon: '\u{1F3E0}', label: '\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629', route: '/dashboard', exact: true },
    { icon: '\u{1F4B3}', label: '\u0627\u0644
