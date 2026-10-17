/**
 * Simple receipt QR payload builder.
 * Encodes only: business name, purchased item names with quantities
 * and prices, and the invoice total — as human-readable plain text
 * that any QR scanner can read.
 */

export interface ReceiptQrItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/**
 * Builds the plain-text payload for the receipt QR code:
 * business name on the first line, one line per item, total on the last line.
 */
export function buildReceiptQr(
  shopName: string,
  items: ReceiptQrItem[],
  total: number
): string {
  const lines: string[] = [shopName.trim() || ''];
  for (const item of items) {
    lines.push(
      `${item.productName} x${item.quantity} - ${item.total.toFixed(2)}`
    );
  }
  lines.push(`Total: ${total.toFixed(2)}`);
  return lines.join('\n');
}
