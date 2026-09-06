import type { Business } from "@/lib/db";
import { joinAddressParts } from "@/lib/address";

export function buildInvoiceSellerSnapshot(business: Business) {
  return {
    seller_name: business.legal_name ?? business.name,
    seller_email: business.email,
    seller_phone: business.phone,
    seller_tax_id: business.tax_id,
    seller_address: joinAddressParts([
      business.address_line_1,
      business.address_line_2,
      business.city,
      business.region,
      business.postal_code,
      business.country_code,
    ]),
    invoice_footer: business.invoice_footer,
  };
}
