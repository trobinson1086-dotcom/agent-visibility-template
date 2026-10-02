// Cloudflare Pages Function port of source/api/create-checkout-session.js.
// Same request/response contract; calls the Stripe REST API directly because the
// Node SDK does not run in the Workers runtime. STRIPE_SECRET_KEY is a Pages secret.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Secure checkout is temporarily unavailable.' }, 503);
  try {
    const { items } = (await request.json()) || {};
    if (!Array.isArray(items) || !items.length) return json({ error: 'Cart is empty' }, 400);
    const form = new URLSearchParams();
    items.forEach((i, n) => {
      if (!/^price_[A-Za-z0-9]+$/.test(i.priceId || '')) throw new Error('Invalid price');
      const quantity = Math.max(1, Math.min(25, parseInt(i.quantity || 1, 10) || 1));
      form.append(`line_items[${n}][price]`, i.priceId);
      form.append(`line_items[${n}][quantity]`, String(quantity));
    });
    const origin = env.SITE_URL || 'https://genesisdigitalpro.com';
    form.append('mode', 'payment');
    form.append('success_url', `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
    form.append('cancel_url', `${origin}/cart.html`);
    form.append('customer_creation', 'always');
    form.append('billing_address_collection', 'auto');
    form.append('allow_promotion_codes', 'true');
    form.append('metadata[store]', 'Genesis Digital Pro');
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const session = await r.json();
    if (!r.ok || !session.url) return json({ error: 'Unable to start secure checkout.' }, 400);
    return json({ url: session.url });
  } catch (_) {
    return json({ error: 'Unable to start secure checkout.' }, 400);
  }
}

export async function onRequest({ request }) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
}
