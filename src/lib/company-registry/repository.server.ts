import { createClient } from "@supabase/supabase-js";

import type { CompanyRegistrySource } from "./types";
import { validateVerifiedSource } from "./validation";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

function getClient() {
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function listVerifiedCompanyRegistrySources(): Promise<CompanyRegistrySource[]> {
  const client = getClient();
  if (!client) return [];

  const { data, error } = await client
    .from("company_registry_sources")
    .select(
      "id,country_code,country_name_it,country_name_local,eu_member_state,official_register_name,official_register_url,official_register_host,official_information_url,official_information_host,search_mode,search_url_template,api_adapter_key,access_type,document_access,terms_status,last_verified_at,status,notes",
    )
    .eq("status", "VERIFIED")
    .eq("eu_member_state", true)
    .order("country_name_it", { ascending: true });

  if (error) throw new Error(`Company registry unavailable: ${error.message}`);

  const sources = (data ?? []) as CompanyRegistrySource[];
  return sources.filter((source) => validateVerifiedSource(source).length === 0);
}
