// Holiday sale, Black Friday to Cyber Monday (Eastern): Fri Nov 27 00:00 until Tue Dec 1 00:00.
// The checkout uses the same two times (src/fulfillment/bundles.ts HOLIDAY_SALE), so the
// banner, the prices on the page and the price at checkout always agree.
// Add ?holiday=preview to any page to see the sale look before it starts.
(function(){
 var START=Date.parse('2026-11-27T00:00:00-05:00'),END=Date.parse('2026-12-01T00:00:00-05:00');
 var now=Date.now(),preview=/[?&]holiday=preview\b/.test(location.search),on=preview||(now>=START&&now<END);
 if(!on)return;
 document.documentElement.classList.add('holiday-on');
 document.querySelectorAll('.holiday-bar').forEach(function(b){b.hidden=false});
 document.querySelectorAll('[data-sale-price]').forEach(function(el){var n=el.querySelector('.price-now');if(n)n.textContent=el.dataset.salePrice;var s=el.querySelector('.sale-note');if(s)s.hidden=false});
 document.querySelectorAll('[data-holiday-only]').forEach(function(el){el.hidden=false});
 document.querySelectorAll('[data-everyday-only]').forEach(function(el){el.hidden=true});
 var cds=document.querySelectorAll('[data-countdown]');if(!cds.length)return;
 function tick(){var ms=Math.max(0,(preview&&Date.now()<START?END-START:END-Date.now())),d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5),m=Math.floor(ms%36e5/6e4);
  var t=(d?d+'d ':'')+h+'h '+m+'m';cds.forEach(function(el){el.textContent=t})}
 tick();setInterval(tick,30000);
})();
