// Cloudflare Pages Function port of source/api/stripe-webhook.js.
// Verifies the Stripe-Signature header (HMAC-SHA256 over "timestamp.payload")
// with STRIPE_WEBHOOK_SECRET, a Pages secret. Fulfillment is still a hook, as in
// the original.

const TOLERANCE_SECONDS = 300;

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(payload, header, secret) {
  const parts = {};
  const signatures = [];
  for (const kv of (header || '').split(',')) {
    const [k, v] = kv.split('=');
    if (k === 't') parts.t = v;
    if (k === 'v1') signatures.push(v);
  }
  const t = Number(parts.t);
  if (!t || !signatures.length || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`)));
  return signatures.some((s) => safeEqual(s, expected));
}

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await verify(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('Webhook verification failed', { status: 400 });
  }
  const event = JSON.parse(payload);
  if (event.type === 'checkout.session.completed') {
    // Fulfillment hook: connect physical fulfillment and secure digital delivery here.
    console.log('Genesis Digital Pro paid order', event.data.object.id);
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'content-type': 'application/json' } });
}

export async function onRequest({ request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
}
