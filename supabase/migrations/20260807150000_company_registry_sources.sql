create table if not exists public.company_registry_sources (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null unique,
  country_name_it text not null,
  country_name_local text not null,
  eu_member_state boolean not null default true,
  official_register_name text not null,
  official_register_url text not null,
  official_information_url text not null,
  search_mode text not null check (search_mode in ('EXTERNAL_REGISTER','INTEGRATED_API','OPEN_DATA','NOT_AVAILABLE','UNDER_REVIEW')),
  search_url_template text,
  api_adapter_key text,
  access_type text not null check (access_type in ('FREE','PARTLY_FREE','PAID','CONDITIONS_APPLY','UNKNOWN')),
  document_access text not null check (document_access in ('AVAILABLE','PARTLY_AVAILABLE','PAID','NOT_AVAILABLE','UNKNOWN')),
  terms_status text not null,
  last_verified_at timestamptz not null,
  status text not null check (status in ('VERIFIED','UNDER_REVIEW','UNAVAILABLE','RETIRED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_registry_sources_https_url check (official_register_url ~ '^https://'),
  constraint company_registry_sources_https_info_url check (official_information_url ~ '^https://')
);

create table if not exists public.company_registry_verifications (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.company_registry_sources(id) on delete cascade,
  checked_at timestamptz not null default now(),
  checker_type text not null,
  outcome text not null,
  http_status integer,
  evidence_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.company_search_audit_events (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  country_code char(2),
  search_mode text,
  adapter_key text,
  outcome text not null,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists company_registry_sources_status_idx on public.company_registry_sources(status);
create index if not exists company_registry_sources_country_idx on public.company_registry_sources(country_code);
create index if not exists company_registry_verifications_source_idx on public.company_registry_verifications(source_id);
create index if not exists company_search_audit_events_created_idx on public.company_search_audit_events(created_at desc);

alter table public.company_registry_sources enable row level security;
alter table public.company_registry_verifications enable row level security;
alter table public.company_search_audit_events enable row level security;

drop policy if exists "public can read verified company registry sources" on public.company_registry_sources;
create policy "public can read verified company registry sources"
  on public.company_registry_sources
  for select
  to anon, authenticated
  using (status = 'VERIFIED');

-- No public policies are created for verification or audit tables.
-- service_role bypasses RLS for server-side governance and audit writes.

insert into public.company_registry_sources
(country_code, country_name_it, country_name_local, official_register_name, official_register_url, official_information_url, search_mode, access_type, document_access, terms_status, last_verified_at, status, notes)
values
('AT','Austria','Österreich','Österreichisches Firmenbuch / Official Business Register','https://www.justiz.gv.at/service/datenbanken/firmenbuch/firmenbuchabfrage.2c9484852308c2a601240b693e1c0860.de.html','https://www.justiz.gv.at/service/datenbanken/firmenbuch/firmenbuchabfrage.2c9484852308c2a601240b693e1c0860.de.html','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official national register link verified against the European e-Justice Portal. No undocumented deep-link template is used.'),
('BE','Belgium','België / Belgique / Belgien','Kruispuntbank van Ondernemingen / Banque-Carrefour des Entreprises','https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html?lang=en','https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises','EXTERNAL_REGISTER','FREE','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Public Search is identified by the European e-Justice Portal; application/API reuse terms are not asserted.'),
('BG','Bulgaria','България','Търговски регистър / Commercial Register','https://portal.registryagency.bg','https://portal.registryagency.bg','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official register portal verified against the European e-Justice Portal.'),
('HR','Croatia','Hrvatska','Sudski registar / Court Register','https://sudreg.pravosudje.hr/','https://sudreg.pravosudje.hr/','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official court register verified against the European e-Justice Portal.'),
('CY','Cyprus','Κύπρος','Registrar of Companies and Intellectual Property – Business Entities Register','https://www.gov.cy/en/service/electronic-research-in-the-business-entities-register/','https://www.gov.cy/en/service/electronic-research-in-the-business-entities-register/','EXTERNAL_REGISTER','CONDITIONS_APPLY','UNKNOWN','VERIFIED','2026-08-07T00:00:00Z','VERIFIED','Official Gov.cy electronic research service verified; CY Login is required.'),
('CZ','Czech Republic','Česká republika','Veřejný rejstřík / Public Register (Commercial Register)','https://or.justice.cz/ias/ui/rejstrik','https://or.justice.cz/ias/ui/rejstrik','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official Ministry of Justice register search verified against the European e-Justice Portal.'),
('DK','Denmark','Danmark','Erhvervsstyrelsen / Danish Business Authority','https://datacvr.virk.dk/','https://datacvr.virk.dk/','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official CVR search portal verified against the European e-Justice Portal.'),
('EE','Estonia','Eesti','Äriregister / Commercial Register','https://ariregister.rik.ee/eng','https://ariregister.rik.ee/eng','EXTERNAL_REGISTER','FREE','PAID','VERIFIED','2026-08-07T00:00:00Z','VERIFIED','European e-Justice states basic registry data can be searched free of charge and documents can be fee-based.'),
('FI','Finland','Suomi / Finland','Patentti- ja Rekisterihallitus / Finnish Patent and Registration Office','https://www.prh.fi/en/index.html','https://www.prh.fi/en/index.html','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official PRH portal verified against the European e-Justice Portal.'),
('FR','France','France','Registre du Commerce et des Sociétés / Business Register','https://www.infogreffe.com/','https://www.infogreffe.com/','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Business-register access point identified by the European e-Justice Portal; no undocumented API is asserted.'),
('DE','Germany','Deutschland','Handelsregister / Business Register; Unternehmensregister / Commercial Register','https://www.handelsregister.de/rp_web/welcome.do?language=en','https://www.unternehmensregister.de/ureg/','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official register portals verified against the European e-Justice Portal.'),
('GR','Greece','Ελλάδα','Γενικό Εμπορικό Μητρώο (Γ.Ε.ΜΗ.) / General Commercial Register','https://www.businessportal.gr/en/','https://www.gov.gr/en/ipiresies/epikheirematike-drasterioteta/enarxe-kai-luse-epikheireses/stoikheia-demosiotetas-emporikon-epikheireseon-eggegrammenon-sto-geme/','EXTERNAL_REGISTER','FREE','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official GEMI search service verified through Gov.gr; search supports TIN, GEMI number and company name.'),
('HU','Hungary','Magyarország','Országos Cégnyilvántartó és Céginformációs Rendszer / Company Information System','https://occsz.e-cegjegyzek.hu/info/page/ceginfo','https://occsz.e-cegjegyzek.hu/info/page/ceginfo','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official company information portal identified by the European e-Justice Portal.'),
('IE','Ireland','Éire / Ireland','Companies Registration Office','https://www.cro.ie/','https://www.cro.ie/','EXTERNAL_REGISTER','FREE','PAID','VERIFIED','2026-08-07T00:00:00Z','VERIFIED','European e-Justice states basic company information is free and other information may be fee-based.'),
('IT','Italy','Italia','Registro delle imprese / Business Register','https://italianbusinessregister.it','https://italianbusinessregister.it','EXTERNAL_REGISTER','PARTLY_FREE','PAID','VERIFIED','2026-08-07T00:00:00Z','VERIFIED','European e-Justice states limited information is free and complete information is available against payment.'),
('LV','Latvia','Latvija','Latvijas Republikas Uzņēmumu Reģistrs / Register of Enterprises','https://www.ur.gov.lv/en/','https://www.ur.gov.lv/en/','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official Register of Enterprises portal verified against the European e-Justice Portal.'),
('LT','Lithuania','Lietuva','Juridinių asmenų registras / Register of Legal Entities','https://www.registrucentras.lt','https://www.registrucentras.lt','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official Centre of Registers portal identified by the European e-Justice Portal.'),
('LU','Luxembourg','Luxembourg','Registre de commerce et des sociétés / Trade and Companies Register','https://www.lbr.lu','https://www.lbr.lu','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official LBR portal verified against the European e-Justice Portal.'),
('MT','Malta','Malta','Malta Business Registry / Registrar of Companies','https://mbr.mt/','https://mbr.mt/','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official Malta Business Registry portal identified by the European e-Justice Portal.'),
('NL','Netherlands','Nederland','Handelsregister / Business Register','https://www.kvk.nl/english/ordering-products-from-the-commercial-register/','https://www.kvk.nl/english/ordering-products-from-the-commercial-register/','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official Chamber of Commerce portal identified by the European e-Justice Portal.'),
('PL','Poland','Polska','Krajowy Rejestr Sądowy / National Court Register','https://ekrs.ms.gov.pl/web/wyszukiwarka-krs/strona-glowna/index.html','https://ekrs.ms.gov.pl/web/wyszukiwarka-krs/strona-glowna/index.html','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official Ministry of Justice search portal identified by the European e-Justice Portal.'),
('PT','Portugal','Portugal','Registo Comercial / Commercial Register','https://irn.justica.gov.pt/','https://irn.justica.gov.pt/','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official IRN portal identified by the European e-Justice Portal.'),
('RO','Romania','România','Oficiul Național al Registrului Comerțului / National Trade Register Office','https://www.onrc.ro/index.php/en','https://www.onrc.ro/index.php/en','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official ONRC portal identified by the European e-Justice Portal.'),
('SK','Slovakia','Slovensko','Obchodný register / Business Register','https://www.orsr.sk/Default.asp?lan=en','https://www.orsr.sk/Default.asp?lan=en','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official Ministry of Justice register confirmed current and searchable by name or identification number.'),
('SI','Slovenia','Slovenija','Poslovni register Slovenije / Slovenian Business Register','https://www.ajpes.si/prs/Default.asp?language=english','https://www.ajpes.si/prs/Default.asp?language=english','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official AJPES register identified by the European e-Justice Portal.'),
('ES','Spain','España','Colegio de Registradores / Business Register','https://www.registradores.org','https://www.registradores.org','EXTERNAL_REGISTER','UNKNOWN','UNKNOWN','UNDER_REVIEW','2026-08-07T00:00:00Z','VERIFIED','Official business-register access point identified by the European e-Justice Portal.'),
('SE','Sweden','Sverige','Bolagsverket / Swedish Companies','https://bolagsverket.se/en/sokforetagsinformation/omsokforetagsinformation.3045.html','https://bolagsverket.se/en/sokforetagsinformation/omsokforetagsinformation.3045.html','EXTERNAL_REGISTER','FREE','PAID','VERIFIED','2026-08-07T00:00:00Z','VERIFIED','Official Bolagsverket search page verified; current company information is searchable free of charge and documents can be purchased.')
on conflict (country_code) do update set
  country_name_it = excluded.country_name_it,
  country_name_local = excluded.country_name_local,
  official_register_name = excluded.official_register_name,
  official_register_url = excluded.official_register_url,
  official_information_url = excluded.official_information_url,
  search_mode = excluded.search_mode,
  access_type = excluded.access_type,
  document_access = excluded.document_access,
  terms_status = excluded.terms_status,
  last_verified_at = excluded.last_verified_at,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

insert into public.company_registry_verifications (source_id, checked_at, checker_type, outcome, evidence_url, notes)
select id, last_verified_at, 'EU_EJUSTICE_INDEX', 'VERIFIED', 'https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu/general-information-find-company_en', notes
from public.company_registry_sources
where eu_member_state = true
on conflict do nothing;
