export type FolioSearchResultType =
  | "customer"
  | "invoice"
  | "recurring"
  | "item"
  | "payment"
  | "expense";

export type FolioSearchResult = {
  badge?: string;
  description: string;
  href: string;
  id: string;
  title: string;
  type: FolioSearchResultType;
};

export type FolioSearchGroup = {
  key: FolioSearchResultType;
  label: string;
  results: FolioSearchResult[];
};

export type FolioSearchResponse = {
  groups: FolioSearchGroup[];
};
