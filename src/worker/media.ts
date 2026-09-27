/**
 * R2-backed media serving with HTTP byte-range support.
 *
 * Browsers (Safari/iOS in particular) refuse to play or seek an MP4 unless the
 * server answers `Range: bytes=…` with `206 Partial Content`. Static assets
 * always answer 200 with the full body, so `/assets/media/*` is served from R2
 * here instead. The R2 key is the URL path without the leading slash, so the
 * public URL never changes.
 */

export const MEDIA_PREFIX = "/assets/media/";

const CACHE_CONTROL = "public, max-age=86400";

type ByteRange = { offset: number; length: number };

/**
 * Parse a single `bytes=` range against an object of `size` bytes.
 * Returns `undefined` when the header should be ignored (absent, malformed or
 * multi-range, which RFC 9110 lets us answer with a full 200), and `null`
 * when it is unsatisfiable (416).
 */
export function parseRange(
	header: string | null,
	size: number,
): ByteRange | null | undefined {
	if (!header) return undefined;
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m) return undefined;
	const [, startStr, endStr] = m;
	if (startStr === "" && endStr === "") return undefined;

	if (startStr === "") {
		// Suffix range: the last N bytes.
		const suffix = Number(endStr);
		if (suffix === 0 || size === 0) return null;
		const length = Math.min(suffix, size);
		return { offset: size - length, length };
	}

	const start = Number(startStr);
	if (start >= size) return null;
	const end = endStr === "" ? size - 1 : Math.min(Number(endStr), size - 1);
	if (end < start) return undefined;
	return { offset: start, length: end - start + 1 };
}

/** Map a request path under MEDIA_PREFIX to its R2 key, or null if invalid. */
export function mediaKey(pathname: string): string | null {
	if (!pathname.startsWith(MEDIA_PREFIX)) return null;
	let key: string;
	try {
		key = decodeURIComponent(pathname.slice(1));
	} catch {
		return null;
	}
	if (key.length === MEDIA_PREFIX.length - 1 || key.includes("..")) return null;
	return key;
}

/**
 * Serve `key` from `bucket`, honouring Range / If-Range / If-None-Match.
 * Returns null when the object doesn't exist so the caller can fall back.
 */
export async function serveMedia(
	request: Request,
	bucket: R2Bucket,
	key: string,
): Promise<Response | null> {
	const head = await bucket.head(key);
	if (!head) return null;

	const headers = new Headers();
	head.writeHttpMetadata(headers);
	if (!headers.has("content-type")) headers.set("content-type", "video/mp4");
	headers.set("etag", head.httpEtag);
	headers.set("last-modified", head.uploaded.toUTCString());
	headers.set("accept-ranges", "bytes");
	headers.set("cache-control", CACHE_CONTROL);

	const ifNoneMatch = request.headers.get("if-none-match");
	if (ifNoneMatch && ifNoneMatch.split(/\s*,\s*/).includes(head.httpEtag)) {
		return new Response(null, { status: 304, headers });
	}

	const size = head.size;
	let range = parseRange(request.headers.get("range"), size);
	// If-Range: only honour the range when the client's copy is current.
	const ifRange = request.headers.get("if-range");
	if (range !== undefined && ifRange && ifRange !== head.httpEtag) {
		range = undefined;
	}

	if (range === null) {
		headers.set("content-range", `bytes */${size}`);
		headers.set("content-length", "0");
		return new Response(null, { status: 416, headers });
	}

	const status = range ? 206 : 200;
	const length = range ? range.length : size;
	headers.set("content-length", String(length));
	if (range) {
		headers.set(
			"content-range",
			`bytes ${range.offset}-${range.offset + range.length - 1}/${size}`,
		);
	}

	if (request.method === "HEAD") {
		return new Response(null, { status, headers });
	}

	const obj = await bucket.get(key, range ? { range } : undefined);
	if (!obj) return null;
	return new Response(obj.body, { status, headers });
}
