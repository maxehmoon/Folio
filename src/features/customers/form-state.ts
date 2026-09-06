import type { CustomerInput } from "@/features/customers/schema";

export type CustomerField = keyof CustomerInput;
export type CustomerFormValues = { [Field in CustomerField]: string };
export type CustomerFormErrorField = CustomerField | "avatar";

export type CustomerFormState = {
  message?: string;
  errors?: Partial<Record<CustomerFormErrorField, string[]>>;
  values?: CustomerFormValues;
};

export const emptyCustomerFormState: CustomerFormState = {};
