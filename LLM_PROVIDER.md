# LLM Provider — Attualità Pipeline

## Contract

`news-generate` uses OpenRouter through the OpenAI-compatible Chat Completions endpoint.

- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Default model: `nvidia/nemotron-3-ultra-550b-a55b:free`
- API secret: `OPENROUTER_API_KEY`
- Fallback model: `openai/gpt-4o-mini`
- Timeout: `LLM_TIMEOUT_MS`, default 60 seconds
- Primary retries: `LLM_MAX_RETRIES`, default 1

The authorization gate remains the first control boundary: the LLM is not called until `authorizeCaller` succeeds.

## Resilience

The primary model is retried according to `LLM_MAX_RETRIES`. Only after the primary retry budget is exhausted does the function make one fallback request. The fallback is also routed through OpenRouter, so no direct OpenAI API key is required.

## Security

`OPENROUTER_API_KEY` is server-side only. Logs and persisted error strings must pass through `redactSecret` before being emitted or stored.

The selected `:free` model is currently listed by OpenRouter as a free NVIDIA Nemotron 3 Ultra endpoint. OpenRouter notes that free endpoints can have usage limits and that prompts/responses sent to this free endpoint may be logged/processed by the provider; therefore this pipeline should send only content that is appropriate for that provider. See the model page before production use.
