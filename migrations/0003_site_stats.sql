-- Squish Man's own visitor counter (src/stats). The worker also creates these
-- tables on first use (ensureStatsSchema), so this migration is optional on the
-- live database. No IP addresses or cookies: `visitor` is a hash with a salt
-- that changes every Eastern day and is deleted after two days.
CREATE TABLE IF NOT EXISTS site_hits (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	ts INTEGER NOT NULL,
	day TEXT NOT NULL,
	hour INTEGER NOT NULL,
	weekday TEXT,
	kind TEXT NOT NULL,
	path TEXT NOT NULL,
	label TEXT,
	entry INTEGER NOT NULL DEFAULT 0,
	repeat_visitor INTEGER NOT NULL DEFAULT 0,
	secs INTEGER NOT NULL DEFAULT 0,
	source TEXT NOT NULL,
	ref_host TEXT,
	utm_source TEXT,
	utm_medium TEXT,
	utm_campaign TEXT,
	utm_content TEXT,
	browser TEXT,
	os TEXT,
	device TEXT,
	lang TEXT,
	country TEXT,
	region TEXT,
	city TEXT,
	visitor TEXT NOT NULL,
	test INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS site_hits_day ON site_hits (day, kind);
CREATE INDEX IF NOT EXISTS site_hits_ts ON site_hits (ts);
CREATE TABLE IF NOT EXISTS site_salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL);
