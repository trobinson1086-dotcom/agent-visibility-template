/**
 * Shared types for the Agent Visibility template.
 *
 * The whole template is built around one idea: a single store of enriched
 * "resources" (pages, articles, docs — anything an AI agent might want to
 * read) that gets projected onto many agent-discovery surfaces. Everything
 * downstream (llms.txt, /index.json, per-page Markdown, JSON-LD, ...) is just
 * a different rendering of the `Resource[]` below.
 */

/** A piece of source content before enrichment. */
export interface RawResource {
	/** URL-safe identifier, unique within the site (e.g. "getting-started"). */
	slug: string;
	/** Canonical URL where a human would read this content. */
	url: string;
	/** Optional human title; if omitted, enrichment will derive one. */
	title?: string;
	/**
	 * Raw content. Either HTML (e.g. fetched from a live page) or plain text /
	 * Markdown. Enrichment trims and summarizes it.
	 */
	body: string;
	/**
	 * Optional fixed price line (e.g. "Paperback $19.99 • Hardcover $29.99").
	 * Passed through enrichment unchanged so surfaces always show exact prices.
	 */
	prices?: string;
}

/** A resource after Workers AI enrichment — the canonical record we store. */
export interface Resource {
	slug: string;
	url: string;
	/** Short, human-readable title. */
	title: string;
	/** 2–4 sentence, agent-friendly summary of the content. */
	summary: string;
	/** 3–6 short bullet points capturing the key facts. */
	keyPoints: string[];
	/** Up to 8 topic / keyword tags for discovery. */
	topics: string[];
	/** A single best-fit category label, or null. */
	category: string | null;
	/** Clean Markdown body suitable for grounding / citation. */
	content: string;
	/** Exact price line copied from the raw resource, if any. */
	prices?: string;
	/** ISO timestamp of when enrichment last ran. */
	updatedAt: string;
	/** Workers AI model used for enrichment. */
	model: string;
}

/** Site-level configuration, read from Worker `vars`. */
export interface SiteConfig {
	name: string;
	description: string;
	/** Absolute origin, e.g. "https://example.com" — derived from the request. */
	origin: string;
}

/** Bindings available to the Worker. Mirrors wrangler.jsonc. */
export interface Env {
	AI: Ai;
	VISIBILITY_CACHE: KVNamespace;
	SITE_NAME: string;
	SITE_DESCRIPTION: string;
	AI_MODEL: string;
	ENRICHMENT_CACHE_TTL: string;
	CONTENT_SIGNAL: string;
	ENABLE_WEB_BOT_AUTH: string;
	/**
	 * Secret bearer token required for the mutating API routes
	 * (POST /api/resources, POST /api/refresh). Set with:
	 *   npx wrangler secret put ADMIN_TOKEN
	 * When unset, those routes are disabled (return 401).
	 */
	ADMIN_TOKEN?: string;

	// --- Lulu print-on-demand fulfillment (src/fulfillment) -----------------
	/** D1 database holding one fulfillment record per paid Stripe checkout. */
	ORDERS_DB?: D1Database;
	/** "off" (default) | "sandbox" | "production". See src/fulfillment/service.ts. */
	FULFILLMENT_MODE?: string;
	/** Lulu shipping level: MAIL | PRIORITY_MAIL | GROUND | EXPEDITED | EXPRESS. */
	LULU_SHIPPING_LEVEL?: string;
	/** Shop contact email Lulu uses for print-job questions. */
	FULFILLMENT_CONTACT_EMAIL?: string;
	/** Secret: restricted Stripe key with read access to Checkout Sessions. */
	STRIPE_SECRET_KEY?: string;
	/** Secret: signing secret of the Stripe webhook endpoint. */
	STRIPE_WEBHOOK_SECRET?: string;
	/** Secrets: Lulu API client key/secret for the environment FULFILLMENT_MODE selects. */
	LULU_CLIENT_KEY?: string;
	LULU_CLIENT_SECRET?: string;
	/** Secret: JSON of print PDF URLs by catalog key, {"EN-PAPERBACK-1": {"cover": …, "interior": …}}. */
	LULU_PRINT_FILES?: string;
}
