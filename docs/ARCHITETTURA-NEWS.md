# Architettura Sezione Attualità — Transfer Guide Italia

> Versione: 1.0 — 2026-08-06  
> Autore: Senior Solutions Architect (Perplexity/SKILLTato)

---

## 1. Obiettivo

Costruire una sezione **Attualità** ispirata a regfollower.com ma con **solo fonti istituzionali primarie**: nessun aggregator commerciale, nessun editore privato, nessun rimando a regfollower/taxsignals/Kluwer.

---

## 2. Schema DB (2 tabelle — YAGNI)

### `news_sources`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| name | text | Es. "OECD Tax News" |
| feed_url | text | URL RSS/Atom/HTML |
| watch_type | enum | RSS, ATOM, HTML_WATCH |
| category | text | TP, VAT, P2, AA |
| country | text | IT, EU, INT, US, UK, IN, AU, CA |
| enabled | bool | false = disabilitata |
| health_status | text | OK, ERROR, DISABLED |
| fail_count | int | reset a 0 a ogni successo |
| last_fetched_at | timestamptz | |

### `news_items`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| slug | text UNIQUE | URL-friendly |
| title | text | Titolo originale |
| summary | text | Max 500 chars, strip HTML |
| category | text | TP, VAT, P2, AA |
| country | text | Paese fonte |
| source_name | text | Nome fonte |
| source_url | text UNIQUE | URL canonico — usato per dedup |
| status | text | DRAFT → IN_REVIEW → PUBLISHED |
| fetched_at | timestamptz | Quando l'agente ha scaricato |
| published_at | timestamptz | NULL finché editor non approva |
| created_at | timestamptz | |

---

## 3. Workflow Editoriale (OBBLIGATORIO)

```
[Feed RSS/Atom]
      │
      ▼
[Edge Function: news-monitor]
  • isDuplicate(source_url) → skip se già presente
  • parse title + summary
  • INSERT con status = 'DRAFT'
      │
      ▼
[Editor Review] — Supabase Dashboard o pannello futuro
  • Verifica fonte primaria ✓
  • HEAD check URL (404 = discard) ✓
  • Traduzione/arricchimento sommario ✓
  • UPDATE status = 'IN_REVIEW'
      │
      ▼
[Approvazione Finale]
  • UPDATE status = 'PUBLISHED', published_at = now()
  • Trigger enforce_published_at lo protegge
      │
      ▼
[Portale — sezione Attualità]
  • Query: WHERE status = 'PUBLISHED'
  • Filtri: categoria, paese, data
```

**Regola d'oro**: solo articoli con `status = 'PUBLISHED'` sono visibili nel portale. Il trigger `enforce_published_at` garantisce che `published_at` non venga mai impostato su un DRAFT.

---

## 4. Whitelist Fonti Primarie Istituzionali

### Transfer Pricing (TP)
| Fonte | Paese | watch_type |
|---|---|---|
| OECD BEPS Transfer Pricing | INT | RSS |
| OECD Tax News | INT | RSS |
| Agenzia Entrate - Provvedimenti TP | IT | HTML_WATCH |
| CBDT India - Transfer Pricing Circulars | IN | HTML_WATCH |

### Pillar Two (P2)
| Fonte | Paese | watch_type |
|---|---|---|
| OECD Inclusive Framework BEPS | INT | RSS |
| European Commission TAXUD | EU | RSS |
| MEF - D.Lgs. 209/2023 Pillar Two | IT | HTML_WATCH |
| HMRC UK - Pillar Two Guidance | UK | ATOM |
| Government of Canada - Global Minimum Tax | CA | RSS |

### VAT / IVA
| Fonte | Paese | watch_type |
|---|---|---|
| European Commission VAT Updates | EU | RSS |
| Agenzia Entrate - Circolari IVA | IT | HTML_WATCH |
| HMRC UK - VAT Notices | UK | ATOM |
| ATO Australia - GST Updates | AU | RSS |

### Anti-Abuso (AA)
| Fonte | Paese | watch_type |
|---|---|---|
| OECD BEPS Action Plans | INT | RSS |
| EU Code of Conduct Group | EU | HTML_WATCH |
| Agenzia Entrate - Interpelli Anti-abuso | IT | HTML_WATCH |
| IRS - Anti-abuse Guidance | US | RSS |

> ⚠️ **Escluse**: Kluwer International Tax Blog (editore privato commerciale), regfollower.com, taxsignals.com, qualsiasi aggregator terzo.

---

## 5. Scheduling — GitHub Action (no pg_cron)

```yaml
# .github/workflows/news-monitor.yml
name: News Monitor
on:
  schedule:
    - cron: '0 6 * * 1'  # ogni lunedì alle 06:00 UTC
  workflow_dispatch:      # trigger manuale
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Invoke Edge Function
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            "${{ secrets.SUPABASE_URL }}/functions/v1/news-monitor"
```

**Perché GitHub Action invece di pg_cron:**
- pg_cron non disponibile su Supabase free tier
- GitHub Actions: gratuito, log trasparenti, trigger manuale
- Granularità settimanale sufficiente per MVP (notizie fiscali non sono breaking news)

---

## 6. Migrazioni Applicate

| # | File | Descrizione |
|---|---|---|
| 001 | `20260806_news_sources.sql` | Tabella news_sources + seed 17 fonti |
| 002 | `20260806_news_items.sql` | Tabella news_items + RLS + FTS + trigger enforce_published_at |
| 003 | `20260806120000_news_storico_url_index.sql` | Indice UNIQUE su source_url + colonna fetched_at |

---

## 7. Riferimenti Normativi

Il tool replica metodologia di aggregazione news fiscali da fonti primarie istituzionali:
- **OCSE Transfer Pricing Guidelines 2022** (Linee Guida TP)
- **D.Lgs. 209/2023** (recepimento Pillar Two in Italia)
- **Art. 110 c. 7 TUIR** (arm's length principle IT)
- **ATAD Direttiva UE 2016/1164** (Anti Tax Avoidance)
- **Provvedimento AdE 21/11/2023** (Master File + Local File TP)

> ⚠️ **Disclaimer**: ogni articolo non costituisce consulenza fiscale. Per posizioni reali è sempre richiesto tributarista iscritto all'albo + documentazione TP locale.

---

## 8. TODO — Prossimi Step

- [ ] `.github/workflows/news-monitor.yml` — GitHub Action cron
- [ ] Pannello admin React per review DRAFT → PUBLISHED
- [ ] HEAD check automatico URL prima di INSERT
- [ ] Notifica Slack/email a editor quando nuovi DRAFT disponibili
- [ ] Disabilitare `Kluwer International Tax Blog` da news_sources (enabled=false)
