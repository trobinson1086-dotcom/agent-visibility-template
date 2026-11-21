// Buyer referral links (squishman.com/?ref=SQUISHMEGHAN7K2P). Keeps a friend's
// code for 30 days, shows their discount, and pre-fills the code at checkout:
// book buttons (Stripe Payment Links from books.js) get ?prefilled_promo_code,
// collection buttons get &promo= for our own checkout. Does nothing unless the
// worker says the program is on and the code is real (/api/referral/check).
(function(){
  var KEY='squish_ref', RE=/^SQUISH[A-Z]{0,8}[A-HJ-NP-Z2-9]{4}$/, DAY=864e5;
  function load(){try{var v=JSON.parse(localStorage.getItem(KEY)||'null');return v&&v.code&&Date.now()-v.at<30*DAY?v:null}catch(e){return null}}
  function save(code){try{localStorage.setItem(KEY,JSON.stringify({code:code,at:Date.now()}))}catch(e){}}
  function drop(){try{localStorage.removeItem(KEY)}catch(e){}}
  var url=new URL(location.href), fromUrl=(url.searchParams.get('ref')||'').trim().toUpperCase();
  var code=RE.test(fromUrl)?fromUrl:(load()||{}).code;
  if(!code)return;
  if(fromUrl){url.searchParams.delete('ref');history.replaceState(null,'',url.pathname+url.search+url.hash)}
  // Only Squish Man book checkouts from books.js take the code; Squad memberships never do.
  var bookLinks={};
  (window.SQUISH_BOOKS||[]).forEach(function(b){Object.keys(b).forEach(function(k){var v=b[k];if(typeof v==='string'&&/^https:\/\/(book|buy)\.stripe\.com\//.test(v))bookLinks[v.split('?')[0]]=1})});
  function tag(a){
    if(a.dataset.ref===code)return;
    var href=a.getAttribute('href')||'';
    if(bookLinks[href.split('?')[0]]){
      var u=new URL(href);u.searchParams.set('prefilled_promo_code',code);a.href=u.toString();a.dataset.ref=code;
    }else if(href.indexOf('/api/bundle/checkout')===0){
      var b=new URL(href,location.origin);b.searchParams.set('promo',code);a.setAttribute('href',b.pathname+b.search);a.dataset.ref=code;
    }
  }
  function tagAll(root){(root.querySelectorAll?root:document).querySelectorAll('a[href]').forEach(tag)}
  function banner(pct){
    if(document.getElementById('squish-ref'))return;
    var d=document.createElement('div');d.id='squish-ref';d.setAttribute('role','status');
    d.style.cssText='background:#07347d;color:#fff;text-align:center;padding:10px 14px;font:700 14px/1.4 Arial,sans-serif';
    d.innerHTML='🎁 A friend shared Squish Man with you: <span style="color:#ffd632">'+pct+'% off your first order</span> is applied at checkout. Code <b></b>';
    d.querySelector('b').textContent=code;
    document.body.insertBefore(d,document.body.firstChild);
  }
  fetch('/api/referral/check?code='+encodeURIComponent(code),{credentials:'omit'})
    .then(function(r){return r.ok?r.json():null})
    .then(function(r){
      if(!r||!r.on)return;
      if(!r.valid){drop();return}
      save(code);banner(r.percentOff||15);tagAll(document);
      new MutationObserver(function(m){m.forEach(function(x){x.addedNodes.forEach(function(n){if(n.nodeType!==1)return;if(n.tagName==='A')tag(n);else tagAll(n)})})}).observe(document.body,{childList:true,subtree:true});
    })
    .catch(function(){});
})();
