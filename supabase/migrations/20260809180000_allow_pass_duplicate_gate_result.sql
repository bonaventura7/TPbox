-- news-generate writes gate_result = 'PASS_DUPLICATE' when a news_item already exists for
-- the same source_url. That value was never admitted by the check constraints introduced
-- in 20260808210000, so the update was rejected by Postgres and the discovery stayed
-- VERIFIED: on the next run it was picked up again, re-fetched and re-sent to the model.
-- Admitting the value makes the duplicate path terminate instead of looping.

alter table public.news_discovery drop constraint if exists news_discovery_gate_result_check;
alter table public.news_discovery add constraint news_discovery_gate_result_check
  check (gate_result in ('PASS','PASS_DUPLICATE','FAIL_DOMAIN','FAIL_HTTP','FAIL_DUP','FAIL_PDF','FAIL_REF','FAIL_EMPTY','FAIL_UNKNOWN'));

alter table public.news_gate_log drop constraint if exists news_gate_log_gate_result_check;
alter table public.news_gate_log add constraint news_gate_log_gate_result_check
  check (gate_result in ('PASS','PASS_DUPLICATE','FAIL_DOMAIN','FAIL_HTTP','FAIL_DUP','FAIL_PDF','FAIL_REF','FAIL_EMPTY','FAIL_UNKNOWN'));
