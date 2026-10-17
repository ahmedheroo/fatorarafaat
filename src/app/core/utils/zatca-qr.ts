/**
 * ZATCA TLV QR Code Encoder
 * Encodes invoice data in Tag-Length-Value format per ZATCA Saudi Arabia spec.
 * 
 * For Simplified Tax Invoices (B2C), only Tags 1-5 are required:
 *   Tag 1: Seller name
 *   Tag 2: VAT registration number
 *   Tag 3: Timestamp (yyyy-MM-dd'T'HH:mm:ssZ)
 *   Tag 4: Invoice total (with VAT)
 *   Tag 5: VAT total
 *
 * All values are UTF-8 encoded text strings.
 * The final output is base64-encoded.
 */

export interface ZatcaQrData {
  sellerName: string;
  vatNumber: string;
  timestamp: string;     // ISO 8601: yyyy-MM-dd'T'HH:mm:ssZ
  invoiceTotal: string;  // e.g. "29.00"
  vatTotal: string;      // e.g. "3.78"
}

/**
 * Builds a single TLV field: [tag(1 byte)][length(1 byte)][value(N bytes)]
 */
function buildTlvField(tag: number, value: string): number[] {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  return [tag, valueBytes.length, ...valueBytes];
}

/**
 * Encodes ZATCA QR data into a TLV byte array, then base64-encodes it.
 */
export function encodeZatcaQr(data: ZatcaQrData): string {
  const tlv: number[] = [
    ...buildTlvField(1, data.sellerName),
    ...buildTlvField(2, data.vatNumber),
    ...buildTlvField(3, data.timestamp),
    ...buildTlvField(4, data.invoiceTotal),
    ...buildTlvField(5, data.vatTotal),
  ];

  // Convert to Uint8Array then base64
  const bytes = new Uint8Array(tlv);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Formats an ISO date string to ZATCA required format: yyyy-MM-dd'T'HH:mm:ssZ
 */
export function formatZatcaTimestamp(isoDate: string): string {
  const d = new Date(isoDate);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;
}

/**
 * Formats a number to 2 decimal places as a string for ZATCA QR.
 */
export function formatZatcaAmount(amount: number): string {
  return amount.toFixed(2);
}
