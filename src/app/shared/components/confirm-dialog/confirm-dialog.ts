import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    @if (isOpen()) {
      <div class="dialog-overlay" (click)="onCancel()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <h3 class="dialog-title">{{ title() }}</h3>
          <p class="dialog-message">{{ message() }}</p>
          <div class="dialog-actions">
            <button class="btn btn-secondary" (click)="onCancel()">إلغاء</button>
            <button class="btn btn-danger" (click)="onConfirm()">{{ confirmText() }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9000;
      padding: 1rem;
    }
    .dialog {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .dialog-title {
      margin: 0 0 0.75rem;
      font-family: 'Cairo', sans-serif;
      font-size: 1.1rem;
      color: #1f2937;
    }
    .dialog-message {
      margin: 0 0 1.5rem;
      font-family: 'Cairo', sans-serif;
      color: #6b7280;
      line-height: 1.6;
    }
    .dialog-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-start;
    }
    .btn {
      padding: 0.6rem 1.25rem;
      border-radius: 8px;
      border: none;
      font-family: 'Cairo', sans-serif;
      font-size: 0.9rem;
      cursor: pointer;
      font-weight: 600;
    }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    .btn-danger {
      background: #ef4444;
      color: white;
    }
  `]
})
export class ConfirmDialog {
  isOpen = input<boolean>(false);
  title = input<string>('تأكيد');
  message = input<string>('هل أنت متأكد؟');
  confirmText = input<string>('تأكيد');
  confirmed = output<void>();
  cancelled = output<void>();

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
