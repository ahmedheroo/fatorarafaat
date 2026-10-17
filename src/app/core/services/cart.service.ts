import { Injectable, signal, computed } from '@angular/core';
import { CartItem, Product } from '../models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _items = signal<CartItem[]>([]);
  private readonly _discount = signal<number>(0);

  readonly items = this._items.asReadonly();
  readonly discount = this._discount.asReadonly();

  readonly itemCount = computed(() =>
    this._items().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly subtotal = computed(() =>
    this._items().reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );

  readonly total = computed(() => {
    const sub = this.subtotal();
    const disc = this._discount();
    return Math.max(0, sub - disc);
  });

  addItem(product: Product): void {
    const items = this._items();
    const existing = items.find(item => item.product.id === product.id);

    if (existing) {
      this._items.update(list =>
        list.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      this._items.update(list => [...list, { product, quantity: 1 }]);
    }
  }

  removeItem(productId: string): void {
    this._items.update(list => list.filter(item => item.product.id !== productId));
  }

  updateQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(productId);
      return;
    }
    this._items.update(list =>
      list.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }

  incrementQuantity(productId: string): void {
    const item = this._items().find(i => i.product.id === productId);
    if (item) {
      this.updateQuantity(productId, item.quantity + 1);
    }
  }

  decrementQuantity(productId: string): void {
    const item = this._items().find(i => i.product.id === productId);
    if (item) {
      this.updateQuantity(productId, item.quantity - 1);
    }
  }

  setDiscount(amount: number): void {
    this._discount.set(Math.max(0, amount));
  }

  clear(): void {
    this._items.set([]);
    this._discount.set(0);
  }
}
