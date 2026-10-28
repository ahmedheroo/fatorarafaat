import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'arabicDay', standalone: true })
export class ArabicDayPipe implements PipeTransform {
  transform(value: string | Date): string {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ar-SA', { weekday: 'long' });
  }
}
