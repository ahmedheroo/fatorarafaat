import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../core/services/product.service';
import { ToastService } from '../../core/services/toast.service';
import { Product } from '../../core/models';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [RouterLink, FormsModule, ConfirmDialog],
  templateUrl: './product-list.html',
  styles: [`
    .search-section { margin-bottom: 1.5rem; }
    .search-section input { max-width: 400px; }
    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; }
    .product-card { padding: 1rem; }
    .product-img { width: 60px; height: 60px; border-radius: 50%; background: #e0e7ff; color: #3b82f6; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; margin: 0 auto 0.75rem; }
    .product-body { text-align: center; }
    .product-name { font-weight: 700; margin-bottom: 0.25rem; }
    .product-price { color: #10b981; font-weight: 700; font-size: 1.1rem; margin-bottom: 0.25rem; }
    .product-sku { font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.5rem; }
    .product-actions { display: flex; gap: 0.5rem; justify-content: center; margin-top: 0.75rem; }
    .empty-state-box { text-align: center; color: #9ca3af; padding: 3rem; font-size: 1rem; }
  `]
})
export class ProductList implements OnInit {
  private productService = inject(ProductService);
  private toast = inject(ToastService);
  searchQuery = '';
  showDeleteDialog = signal(false);
  productToDelete: Product | null = null;
  filteredProducts = signal<Product[]>([]);

  ngOnInit(): void {
    this.filteredProducts.set(this.productService.getActiveProducts());
  }

  filterProducts(): void {
    const q = this.searchQuery.trim();
    if (!q) {
      this.filteredProducts.set(this.productService.getActiveProducts());
    } else {
      this.filteredProducts.set(this.productService.searchProducts(q));
    }
  }

  confirmDelete(product: Product): void {
    this.productToDelete = product;
    this.showDeleteDialog.set(true);
  }

  async onDelete(): Promise<void> {
    if (this.productToDelete) {
      await this.productService.deleteProduct(this.productToDelete.id);
      this.toast.success('تم حذف المنتج');
      this.filterProducts();
    }
    this.showDeleteDialog.set(false);
  }
}
