export type BusinessSetupDraft = Partial<
  Record<
    | "name"
    | "legalName"
    | "email"
    | "phone"
    | "taxId"
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "region"
    | "postalCode"
    | "countryCode"
    | "currency"
    | "paymentTermsDays"
    | "invoicePrefix"
    | "timezone"
    | "paymentInstructions"
    | "invoiceFooter",
    string
  >
>
