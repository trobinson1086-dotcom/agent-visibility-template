/**
 * squishman-media: a route Worker on `squishman.com/assets/media/*`.
 *
 * squishman.com is a Custom Domain on the main Worker, so a zone route runs
 * first and can pass through with `fetch(request)`. This Worker serves video
 * from R2 with byte-range (206) support and hands anything it doesn't have
 * straight back to the main Worker, leaving the site's assets untouched.
 */
import { mediaKey, serveMedia } from "../worker/media";

interface MediaEnv {
	MEDIA_BUCKET: R2Bucket;
}

export default {
	async fetch(request, env): Promise<Response> {
		if (request.method === "GET" || request.method === "HEAD") {
			const key = mediaKey(new URL(request.url).pathname);
			if (key) {
				const res = await serveMedia(request, env.MEDIA_BUCKET, key);
				if (res) return res;
			}
		}
		return fetch(request);
	},
} satisfies ExportedHandler<MediaEnv>;
