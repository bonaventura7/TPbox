#!/usr/bin/env bash
# ============================================================================
# download-norway-companies.sh
# ----------------------------------------------------------------------------
# Download GRATUITO e LEGALE del registro imprese norvegese completo
# (~1.2 milioni di entità) dai Brønnøysundregistrene (fonte ufficiale).
#
# Fonte:    Enhetsregisteret / Foretaksregisteret open data
#           https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html
# Licenza:  NLOD — Norwegian Licence for Open Government Data
#           (attribuzione richiesta: "Contiene dati dai Brønnøysundregistrene
#            secondo la licenza NLOD 2.0")
# Auth:     NESSUNA. No API key, no registrazione. Full open data.
# Uso:      bash scripts/download-norway-companies.sh [output_dir]
# ============================================================================
set -euo pipefail

OUT_DIR="${1:-./norway-companies-data}"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

echo "=================================================================="
echo " Brønnøysundregistrene — Open Data download (NLOD)"
echo " Output: $(pwd)"
echo "=================================================================="

# ---------------------------------------------------------------------------
# 1. ENHETER — tutte le entità principali (~1.2M): CSV totalbestand
#    Risposta gzip con header Accept; -J -O onora il Content-Disposition.
# ---------------------------------------------------------------------------
echo "[1/4] Enheter (entità principali) — CSV completo..."
curl -fSL --retry 3 --retry-delay 5 \
  'https://data.brreg.no/enhetsregisteret/api/enheter/lastned/csv' \
  -X GET -J -O

# ---------------------------------------------------------------------------
# 2. UNDERENHETER — unità secondarie / stabilimenti (~900k): CSV totalbestand
# ---------------------------------------------------------------------------
echo "[2/4] Underenheter (stabilimenti/sedi) — CSV completo..."
curl -fSL --retry 3 --retry-delay 5 \
  'https://data.brreg.no/enhetsregisteret/api/underenheter/lastned/csv' \
  -X GET -J -O

# ---------------------------------------------------------------------------
# 3. (opzionale, commentato) JSON gzip — stesso contenuto, schema nested
# curl -fSL 'https://data.brreg.no/enhetsregisteret/api/enheter/lastned' \
#   -H 'Accept: application/vnd.brreg.enhetsregisteret.enhet.v1+gzip;charset=UTF-8' \
#   -J -O && gzip -df enheter_alle.json.gz
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# 4. Decompressione (i CSV arrivano come .csv.gz se il server gzippa)
# ---------------------------------------------------------------------------
echo "[3/4] Decompressione eventuali .gz..."
for f in *.gz; do [ -e "$f" ] && gzip -df "$f" || true; done

# ---------------------------------------------------------------------------
# 5. Verifica integrità
# ---------------------------------------------------------------------------
echo "[4/4] Verifica:"
for f in *.csv; do
  [ -e "$f" ] || continue
  lines=$(wc -l < "$f")
  echo "  ✓ $f — $((lines - 1)) record (incl. header nella numerazione)"
done

echo
echo "FATTO. Licenza NLOD 2.0 — cita: Brønnøysundregistrene."
echo "API live (aggiornata in tempo reale, paginata, size max 2000):"
echo "  https://data.brreg.no/enhetsregisteret/api/enheter?page=0&size=2000"
