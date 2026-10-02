
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const {items} = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({error:'Cart is empty'});
    const line_items = items.map(i => {
      if (!/^price_[A-Za-z0-9]+$/.test(i.priceId || '')) throw new Error('Invalid price');
      const quantity = Math.max(1, Math.min(25, parseInt(i.quantity || 1,10)));
      return {price:i.priceId, quantity};
    });
    const origin = process.env.SITE_URL || 'https://genesisdigitalpro.com';
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      line_items,
      success_url:`${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${origin}/cart.html`,
      customer_creation:'always',
      billing_address_collection:'auto',
      allow_promotion_codes:true,
      metadata:{store:'Genesis Digital Pro'}
    });
    res.status(200).json({url:session.url});
  } catch (e) {
    res.status(400).json({error:'Unable to start secure checkout.'});
  }
};
