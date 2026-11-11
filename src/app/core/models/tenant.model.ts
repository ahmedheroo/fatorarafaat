/** A client account (one store/company using the POS). */
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  createdAt: string;
}

export interface RegisterTenantDto {
  /** Password issued by the service operator; required to create a store. */
  adminPassword: string;
  storeName: string;
  storeCode?: string;
  ownerName?: string;
  phone?: string;
  username: string;
  password: string;
}
