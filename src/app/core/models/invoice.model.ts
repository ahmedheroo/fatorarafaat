import { PaymentMethod } from './settings.model';

export interface InvoiceItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface CustomerInfo {
  name?: string;
  phone?: string;
  guests?: number | null;
  /** Date/time the customer reserved for (ISO). */
  reservedAt?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: number;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashierName: string;
  branchName: string;
  customerName?: string;
  customerPhone?: string;
  guestsCount?: number;
  /** Date/time the customer reserved for (ISO). Empty when not provided. */
  reservedAt?: string;
  createdAt: string;
}
