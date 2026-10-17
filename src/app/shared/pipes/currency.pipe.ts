import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currencySar', standalone: true })
export class CurrencySarPipe implements PipeTransform {
  transform(value: number): string {
    return value.toFixed(2) + ' ر.س';
  }
}
