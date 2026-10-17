import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="empty-state">
      <div class="empty-icon"><i [class]="icon()"></i></div>
      <p class="empty-message">{{ message() }}</p>
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      text-align: center;
    }
    .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }
    .empty-message {
      font-family: 'Cairo', sans-serif;
      color: #9ca3af;
      font-size: 1rem;
      margin: 0;
    }
  `]
})
export class EmptyState {
  icon = input<string>('fas fa-inbox');
  message = input<string>('لا توجد بيانات');
}
