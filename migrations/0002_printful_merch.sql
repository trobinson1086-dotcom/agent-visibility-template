-- Merch orders fulfilled by Printful share the fulfillments table
-- (see src/fulfillment/merch-service.ts). Existing rows are Lulu book orders.
ALTER TABLE fulfillments ADD COLUMN provider TEXT NOT NULL DEFAULT 'lulu';
ALTER TABLE fulfillments ADD COLUMN printful_order_id TEXT;
ALTER TABLE fulfillments ADD COLUMN printful_status TEXT;
ALTER TABLE fulfillments ADD COLUMN printful_cost_json TEXT;

CREATE INDEX fulfillments_printful_order ON fulfillments (printful_order_id);
