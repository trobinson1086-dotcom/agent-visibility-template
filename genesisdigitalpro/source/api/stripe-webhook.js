
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
module.exports = async (req,res) => {
  const sig=req.headers['stripe-signature'];
  try{
    const event=stripe.webhooks.constructEvent(req.rawBody || req.body,sig,process.env.STRIPE_WEBHOOK_SECRET);
    if(event.type==='checkout.session.completed'){
      const session=event.data.object;
      // Fulfillment hook: connect physical fulfillment and secure digital delivery here.
      console.log('Genesis Digital Pro paid order',session.id);
    }
    res.status(200).json({received:true});
  }catch(e){res.status(400).send('Webhook verification failed');}
};
