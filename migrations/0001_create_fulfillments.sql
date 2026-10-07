-- One fulfillment record per paid Stripe Checkout Session (see src/fulfillment/store.ts).
CREATE TABLE fulfillments (
  stripe_session_id TEXT PRIMARY KEY,
  stripe_event_id TEXT NOT NULL,
  stripe_payment_intent TEXT,
  livemode INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_detail TEXT,
  items_json TEXT NOT NULL,
  shipping_json TEXT,
  shipping_level TEXT NOT NULL,
  lulu_print_job_id TEXT,
  lulu_status TEXT,
  lulu_cost_json TEXT,
  carrier TEXT,
  tracking_id TEXT,
  tracking_urls TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX fulfillments_lulu_job ON fulfillments (lulu_print_job_id);
