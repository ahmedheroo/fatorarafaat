export enum PaymentMethod {
  CASH = 'نقدي',
  CARD = 'بطاقة بنكية'
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
}

export interface Settings {
  shopName: string;
  address: string;
  phone: string;
  taxId: string;
  taxRate: number;
  receiptWidth: '58mm' | '80mm';
  logoUrl: string;
  branches: Branch[];
}

export const DEFAULT_SETTINGS: Settings = {
  shopName: 'مسالخ الماسة المضيئة للحوم',
  address: 'الرياض - المملكة العربية السعودية',
  phone: '0500468430',
  taxId: '311940157300003',
  taxRate: 15,
  receiptWidth: '80mm',
  logoUrl: '',
  branches: [
    { id: 'branch-1', name: 'فرع الرياض الرئيسي', address: 'الرياض - المملكة العربية السعودية', isActive: true },
    { id: 'branch-2', name: 'فرع الإجراء', address: 'الإجراء - المملكة العربية السعودية', isActive: true }
  ]
};
