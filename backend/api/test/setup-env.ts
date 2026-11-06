// Deterministic event processing in tests: no background polling, immediate retries.
process.env.OUTBOX_POLL_MS = '0';
process.env.EVENT_RETRY_BASE_MS = '0';
process.env.EVENT_MAX_ATTEMPTS = '3';
