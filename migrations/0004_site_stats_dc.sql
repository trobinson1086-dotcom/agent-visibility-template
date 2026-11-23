-- Marks visits from cloud and hosting networks (link checkers, scanners) so the
-- stats page counts people only. The worker also adds these on first use.
ALTER TABLE site_hits ADD COLUMN asn INTEGER;
ALTER TABLE site_hits ADD COLUMN as_org TEXT;
ALTER TABLE site_hits ADD COLUMN dc INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS site_hits_dc ON site_hits (dc, day);
