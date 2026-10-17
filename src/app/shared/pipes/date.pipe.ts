import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'arabicDate', standalone: true })
export class ArabicDatePipe implements PipeTransform {
  transform(value: string | Date): string {
    const date = new Date(value);
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
