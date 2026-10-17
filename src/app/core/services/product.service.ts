import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { Product } from '../models';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private readonly _products = signal<Product[]>([]);
  readonly products = this._products.asReadonly();

  async loadProducts(): Promise<void> {
    const products = await firstValueFrom(this.http.get<Product[]>(`${environment.apiBaseUrl}/api/products`));
    this._products.set(products);
  }

  getActiveProducts(): Product[] {
    return this._products().filter(p => p.active);
  }

  getProductById(id: string): Product | undefined {
    return this._products().find(p => p.id === id);
  }

  searchProducts(query: string): Product[] {
    const q = query.toLowerCase().trim();
    return this.getActiveProducts().filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q)
    );
  }

  findByBarcode(barcode: string): Product | undefined {
    return this.getActiveProducts().find(p => p.barcode === barcode);
  }

  async createProduct(data: Omit<Product, 'id' | 'createdAt'>): Promise<Product> {
    const product = await firstValueFrom(this.http.post<Product>(`${environment.apiBaseUrl}/api/products`, data));
    this._products.update(list => [...list, product]);
    return product;
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    const updated = await firstValueFrom(this.http.put<Product>(`${environment.apiBaseUrl}/api/products/${id}`, data));
    this._products.update(list => list.map(p => p.id === id ? updated : p));
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${environment.apiBaseUrl}/api/products/${id}`));
    this._products.update(list => list.filter(p => p.id !== id));
  }

  async toggleActive(id: string): Promise<void> {
    const updated = await firstValueFrom(this.http.patch<Product>(`${environment.apiBaseUrl}/api/products/${id}/toggle`, {}));
    this._products.update(list => list.map(p => p.id === id ? updated : p));
  }

  getActiveCount(): number {
    return this._products().filter(p => p.active).length;
  }

  async seedDefaultProducts(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/api/products/seed`, {}));
    } catch {
      // Server might not be running yet
    }
  }
}
