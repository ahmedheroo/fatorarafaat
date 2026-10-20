import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InvoiceService } from '../../core/services/invoice.service';
import { SettingsService } from '../../core/services/settings.service';
import { Invoice } from '../../core/models';
import { ArabicDatePipe } from '../../shared/pipes/date.pipe';
import { ArabicTimePipe } from '../../shared/pipes/time.pipe';
import { buildReceiptQr } from '../../core/utils/zatca-qr';
import QRCode from 'qrcode';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [RouterLink, ArabicDatePipe, ArabicTimePipe],
  templateUrl: './invoice-detail.html',
  styles: [`
    .inv-section { margin-bottom: 1.5rem; }
    .inv-section h3 { margin-bottom: 0.5rem; }
    .inv-section p { margin: 0.3rem 0; font-size: 0.9rem; }
    .inv-items-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    .inv-items-table th, .inv-items-table td { padding: 0.6rem; text-align: right; border-bottom: 1px solid #f3f4f6; }
    .inv-items-table th { background: #f9fafb; font-weight: 600; }
    .inv-totals { border-top: 2px solid #e5e7eb; padding-top: 0.75rem; }
    .inv-total-row { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.9rem; }
    .inv-grand-total { font-weight: 800; font-size: 1.1rem; border-top: 1px solid #333; margin-top: 0.5rem; padding-top: 0.5rem; }

    .print-only { display: none; }
    .print-receipt {
      width: 80mm; padding: 3mm; font-family: 'Cairo', sans-serif;
      font-size: 10pt; direction: rtl; text-align: right; margin: 0 auto;
      color: #000; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .pr-header, .pr-meta, .pr-totals, .pr-footer { text-align: center; }
    .pr-header { margin-bottom: 5mm; }
    .pr-shop { font-size: 14pt; font-weight: 800; }
    .pr-logo { margin-bottom: 3mm; }
    .pr-logo img { max-width: 40mm; max-height: 15mm; object-fit: contain; }
    .pr-addr, .pr-phone, .pr-taxid { font-size: 8pt; color: #000; }
    .pr-branch { font-size: 8pt; color: #000; margin-top: 1mm; }
    .pr-meta { font-size: 9pt; margin-bottom: 3mm; }
    .pr-divider { border: none; border-top: 1px dashed #000; margin: 3mm 0; }
    .pr-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .pr-table th, .pr-table td { padding: 1.5mm; border-bottom: 1px solid #000; text-align: right; }
    .pr-table th { font-weight: 700; }
    .pr-row { display: flex; justify-content: space-between; font-size: 10pt; padding: 1mm 0; }
    .pr-grand { font-weight: 800; font-size: 12pt; border-top: 1px solid #333; margin-top: 2mm; padding-top: 2mm; }
    .pr-footer { margin-top: 5mm; }
    .pr-footer p { margin: 1mm 0; }
    .pr-shop-name { font-weight: 700; }
    .pr-qr { text-align: center; margin-top: 4mm; }
    .pr-qr img { width: 35mm; height: 35mm; image-rendering: pixelated; }

    @page { size: 80mm auto; margin: 0; }

    @media print {
      .no-print, .screen-only { display: none !important; }
      .print-only { display: block !important; }
      body * { visibility: hidden; }
      .print-receipt, .print-receipt * { visibility: visible; }
      .print-receipt {
        position: absolute; left: 50%; transform: translateX(-50%); top: 0; width: 80mm;
        color: #000 !important; background: #fff !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
    }
  `]
})
export class InvoiceDetail implements OnInit {
  private invoiceService = inject(InvoiceService);
  private settingsService = inject(SettingsService);
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);

  invoice = signal<Invoice | undefined>(undefined);
  settings = computed(() => this.settingsService.settings());
  qrDataUrl = signal<string>('');
  private qrReady: Promise<void> = Promise.resolve();

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    // Prefer the cached list, but fall back to the API (e.g. page refresh
    // before the global invoice preload finishes).
    const cached = this.invoiceService.getInvoiceById(id);
    if (cached) {
      this.invoice.set(cached);
      this.generateQr(cached);
      return;
    }
    try {
      const inv = await firstValueFrom(this.http.get<Invoice>(`${environment.apiBaseUrl}/api/invoices/${id}`));
      this.invoice.set(inv);
      if (inv) this.generateQr(inv);
    } catch { this.invoice.set(undefined); }
  }

  private generateQr(inv: Invoice): void {
    const s = this.settings();
    const qrText = buildReceiptQr(s.shopName, inv.items, inv.total);

    this.qrReady = QRCode.toDataURL(qrText, { width: 400, margin: 1 }).then(async url => {
      this.qrDataUrl.set(url);
      await this.waitForQrImage(url);
    }).catch(() => { /* ignore */ });
  }

  async printInvoice(): Promise<void> {
    await this.qrReady;
    const url = this.qrDataUrl();
    if (url) {
      await this.waitForQrImage(url);
    }
    window.print();
  }

  private async waitForQrImage(url: string): Promise<void> {
    const image = new Image();
    image.src = url;

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
