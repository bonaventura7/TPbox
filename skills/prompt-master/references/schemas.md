# Schemas — output macchina

## analysis
```json
{
  "intent": "string",
  "issues": [{"severity": "high|medium|low", "area": "string", "detail": "string"}],
  "questions": ["string"],
  "rewritten_prompt": "string"
}
```

## comparison
```json
{
  "criteria": [{"name": "string", "weight": 0.0, "score_a": 0, "score_b": 0, "rationale": "string"}],
  "total_a": 0.0,
  "total_b": 0.0,
  "winner": "A|B|tie",
  "merged_prompt": "string"
}
```

## grade
```json
{
  "dimensions": [{"name": "string", "score": 0, "rationale": "string"}],
  "total": 0,
  "band": "production-ready|solid|usable|rewrite",
  "top_actions": ["string"]
}
```

## Regole
- Solo JSON valido, nessun testo attorno, nessun commento.
- Campi mancanti = `null`, mai omessi.
