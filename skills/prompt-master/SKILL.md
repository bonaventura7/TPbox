---
name: prompt-master
description: Analizza, confronta, valuta e riscrive prompt. Usa questa skill quando l'utente chiede di migliorare un prompt, confrontare due varianti, assegnare un punteggio di qualità o produrre output strutturato secondo schemi definiti.
license: See LICENSE.txt
---

# Prompt Master

Skill per l'ingegneria dei prompt end-to-end: analisi, comparazione, grading e riscrittura.

## Quando usarla
- L'utente incolla un prompt e chiede critiche o miglioramenti.
- Servono due o più varianti confrontate su criteri oggettivi.
- Serve un punteggio (rubrica) riproducibile.
- Serve output JSON conforme a uno schema.

## Workflow
1. **Analyze** — leggi `references/analyzer.md`, estrai obiettivo, vincoli, formato atteso, ambiguità, rischi.
2. **Rewrite** — produci una versione migliorata: ruolo, contesto, task, vincoli, formato output, criteri di successo.
3. **Compare** (opzionale) — `references/comparator.md` per il confronto A/B su criteri pesati.
4. **Grade** — `references/grader.md` per la rubrica 0-100 con motivazione per dimensione.
5. **Emit** — se richiesto output macchina, conformati a `references/schemas.md`.

## Regole
- Non inventare requisiti: elenca le ambiguità come domande esplicite.
- Preferisci istruzioni positive ("fai X") a divieti generici.
- Ogni miglioramento deve essere tracciabile a una dimensione della rubrica.
- Mantieni la lingua dell'utente.

## File di riferimento
| File | Uso |
|---|---|
| `references/analyzer.md` | checklist di analisi diagnostica |
| `references/comparator.md` | protocollo di confronto A/B |
| `references/grader.md` | rubrica di valutazione |
| `references/schemas.md` | schemi JSON di output |
| `references/MANIFEST.md` | inventario del pacchetto |
