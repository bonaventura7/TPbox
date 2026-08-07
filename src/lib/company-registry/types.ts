export type CompanyRegistrySearchMode =
  | "EXTERNAL_REGISTER"
  | "INTEGRATED_API"
  | "OPEN_DATA"
  | "NOT_AVAILABLE"
  | "UNDER_REVIEW";

export type CompanyRegistryAccessType =
  | "FREE"
  | "PARTLY_FREE"
  | "PAID"
  | "CONDITIONS_APPLY"
  | "UNKNOWN";

export type CompanyRegistryDocumentAccess =
  | "AVAILABLE"
  | "PARTLY_AVAILABLE"
  | "PAID"
  | "NOT_AVAILABLE"
  | "UNKNOWN";

export type CompanyRegistryStatus =
  | "VERIFIED"
  | "UNDER_REVIEW"
  | "UNAVAILABLE"
  | "RETIRED";

export interface CompanyRegistrySource {
  id: string;
  country_code: string;
  country_name_it: string;
  country_name_local: string;
  eu_member_state: boolean;
  official_register_name: string;
  official_register_url: string;
  official_information_url: string;
  search_mode: CompanyRegistrySearchMode;
  search_url_template: string | null;
  api_adapter_key: string | null;
  access_type: CompanyRegistryAccessType;
  document_access: CompanyRegistryDocumentAccess;
  terms_status: string;
  last_verified_at: string;
  status: CompanyRegistryStatus;
  notes: string | null;
}
