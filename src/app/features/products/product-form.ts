import { Component, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ProductService } from '../../core/services/product.service';
import { ToastService } from '../../core/services/toast.service';
import { Product } from '../../core/models';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './product-form.html',
  styles: ['.form-actions { display: flex; gap: 1rem; margin-top: 1rem; }']
})
export class ProductForm implements OnInit {
  private productService = inject(ProductService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isEdit = signal(false);
  productId = '';
  formData: Omit<Product, 'id' | 'createdAt'> = {
    name: '', price: 0, description: '', sku: '', barcode: '', imageUrl: '', active: true
  };

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.productId = id;
      const product = this.productService.getProductById(id);
      if (product) {
        this.formData = { name: product.name, price: product.price, description: product.description, sku: product.sku, barcode: product.barcode, imageUrl: product.imageUrl, active: product.active };
      }
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.formData.name || this.formData.price <= 0) {
      this.toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    try {
      if (this.isEdit()) {
        await this.productService.updateProduct(this.productId, this.formData);
        this.toast.success('تم تعديل المنتج بنجاح');
      } else {
        await this.productService.createProduct(this.formData);
        this.toast.success('تم إضافة المنتج بنجاح');
      }
      this.router.navigate(['/products']);
    } catch (e: unknown) {
      this.toast.error(e instanceof Error ? e.message : 'حدث خطأ');
    }
  }
}
