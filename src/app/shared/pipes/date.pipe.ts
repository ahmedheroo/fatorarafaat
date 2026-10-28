import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'arabicDate', standalone: true })
export class ArabicDatePipe implements PipeTransform {
  transform(value: string | Date): string {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    // Force the Gregorian calendar with Latin digits so the printed date matches
    // the value the cashier picked in the date field (ar-SA alone renders Hijri).
    return date.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
