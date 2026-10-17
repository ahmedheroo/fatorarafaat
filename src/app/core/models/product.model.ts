export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  sku: string;
  barcode: string;
  imageUrl: string;
  active: boolean;
  createdAt: string;
}

export type CreateProductDto = Omit<Product, 'id' | 'createdAt'>;
export type UpdateProductDto = Partial<Omit<Product, 'id' | 'createdAt'>>;
