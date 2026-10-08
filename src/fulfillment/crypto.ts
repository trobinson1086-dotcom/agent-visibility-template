const enc = new TextEncoder();

export async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
	const k = await crypto.subtle.importKey(
		"raw",
		enc.encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

export function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes));
}

/** Length-checked constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
