import { Component, signal, computed, inject, ViewChild, ElementRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../core/services/cart.service';
import { ProductService } from '../../core/services/product.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { Product, Invoice, PaymentMethod, Branch } from '../../core/models';
import { ArabicDatePipe } from '../../shared/pipes/date.pipe';
import { ArabicTimePipe } from '../../shared/pipes/time.pipe';
import { encodeZatcaQr, formatZatcaTimestamp, formatZatcaAmount } from '../../core/utils/zatca-qr';
import QRCode from 'qrcode';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [FormsModule, ArabicDatePipe, ArabicTimePipe],
  templateUrl: './pos.html',
  styleUrl: './pos.scss'
})
export class Pos implements OnInit {
  @ViewChild('printArea') printArea!: ElementRef;
  cartService = inject(CartService);
  private productService = inject(ProductService);
  private invoiceService = inject(InvoiceService);
  private settingsService = inject(SettingsService);
  private toast = inject(ToastService);

  searchQuery = '';
  barcodeInput = '';
  discountAmount = 0;
  paymentMethod: PaymentMethod = PaymentMethod.CASH;
  showMobileCart = false;
  lastInvoice: Invoice | null = null;
  settings = computed(() => this.settingsService.settings());
  selectedBranchId = signal<string>('');

  filteredProducts = signal<Product[]>([]);

  activeBranches = computed(() =>
    this.settings().branches.filter(b => b.isActive)
  );

  selectedBranch = computed(() =>
    this.settings().branches.find(b => b.id === this.selectedBranchId())
  );

  taxAmount = computed(() => {
    const sub = this.cartService.subtotal();
    const disc = this.discountAmount;
    const rate = this.settings().taxRate;
    return Math.round((sub - disc) * rate / 100 * 100) / 100;
  });

  finalTotal = computed(() => {
    const sub = this.cartService.subtotal();
    const disc = this.discountAmount;
    const tax = this.taxAmount();
    return Math.max(0, Math.round((sub - disc + tax) * 100) / 100);
  });

  ngOnInit(): void {
    this.filteredProducts.set(this.productService.getActiveProducts());
    const firstBranch = this.activeBranches()[0];
    if (firstBranch) {
      this.selectedBranchId.set(firstBranch.id);
    }
  }

  onSearch(): void {
    const q = this.searchQuery.trim();
    if (!q) {
      this.filteredProducts.set(this.productService.getActiveProducts());
    } else {
      this.filteredProducts.set(this.productService.searchProducts(q));
    }
  }

  onBarcodeScan(): void {
    const barcode = this.barcodeInput.trim();
    if (!barcode) return;
    const product = this.productService.findByBarcode(barcode);
    if (product) {
      this.addToCart(product);
      this.barcodeInput = '';
      this.toast.success(`تمت إضافة: ${product.name}`);
    } else {
      this.toast.error('المنتج غير موجود');
    }
  }

  addToCart(product: Product): void {
    this.cartService.addItem(product);
  }

  onDiscountChange(): void {
    this.cartService.setDiscount(this.discountAmount);
  }

  clearCart(): void {
    this.cartService.clear();
    this.discountAmount = 0;
    this.showMobileCart = false;
  }

  async completeSale(): Promise<void> {
    if (this.cartService.items().length === 0) {
      this.toast.error('السلة فارغة');
      return;
    }
    if (!this.selectedBranchId()) {
      this.toast.error('يجب اختيار الفرع أولاً');
      return;
    }
    this.lastInvoice = await this.invoiceService.completeSale(this.paymentMethod, this.selectedBranch()!.name);
    this.discountAmount = 0;
    this.showMobileCart = false;
    this.toast.success('تم إتمام البيع بنجاح');

    await this.renderQrForPrint();
    window.print();
  }

  private async renderQrForPrint(): Promise<void> {
    // Allow Angular to render the print-only invoice after lastInvoice is set.
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const qrEl = document.getElementById('qrCode');
    const invoice = this.lastInvoice;
    if (!qrEl || !invoice) return;

    const s = this.settings();
    const qrBase64 = encodeZatcaQr({
      sellerName: s.shopName,
      vatNumber: s.taxId,
      timestamp: formatZatcaTimestamp(invoice.createdAt),
      invoiceTotal: formatZatcaAmount(invoice.total),
      vatTotal: formatZatcaAmount(invoice.taxAmount),
    });

    try {
      const url = await QRCode.toDataURL(qrBase64, { width: 150, margin: 1 });
      const image = new Image();
      image.width = 150;
      image.height = 150;
      image.alt = 'QR كود';
      image.src = url;
      qrEl.replaceChildren(image);
      await this.waitForImage(image);
    } catch { /* print the receipt even if QR generation fails */ }
  }

  private async waitForImage(image: HTMLImageElement): Promise<void> {
    if (!image.complete) {
      await new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }

    if (image.naturalWidth > 0) {
      await image.decode?.().catch(() => undefined);
    }
  }
}
