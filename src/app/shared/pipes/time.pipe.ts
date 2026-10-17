import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'arabicTime', standalone: true })
export class ArabicTimePipe implements PipeTransform {
  transform(value: string | Date): string {
    const date = new Date(value);
    return date.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
