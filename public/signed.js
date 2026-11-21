// Signed Holiday Edition block on the Story Collection page (src/fulfillment/signed-edition.ts).
// Shows only while the server says it's on sale. ?signed=preview shows the look for checking;
// the checkout itself still refuses until the edition is switched on.
(function(){
 var box=document.querySelector('[data-signed]'),msg=document.querySelector('[data-signed-msg]');if(!box)return;
 var q=location.search,preview=/[?&]signed=preview\b/.test(q);
 function say(t){if(msg){msg.textContent=t;msg.hidden=false}}
 if(/[?&]signed=soldout\b/.test(q))say('All the signed sets are spoken for. The Story Collection is still on sale below.');
 else if(/[?&]signed=closed\b/.test(q))say('The Signed Holiday Edition has ended. The Story Collection is still available below.');
 else if(/[?&]signed=1\b/.test(q))say('Your Signed Holiday Edition is on its way. Watch your mailbox for the bookplate envelope.');
 function fill(s){
  var left=Math.max(0,s.remaining),lim=s.limit;
  box.querySelectorAll('[data-signed-left]').forEach(function(e){e.textContent=left});
  box.querySelectorAll('[data-signed-limit]').forEach(function(e){e.textContent=lim});
  var p=box.querySelector('[data-signed-price]');if(p)p.textContent='$'+(s.priceCents/100).toFixed(2);
  if(left<1&&!preview){box.hidden=true;say('All the signed sets are spoken for. The Story Collection is still on sale below.');return}
  box.hidden=false;
 }
 if(preview){fill({remaining:37,limit:50,priceCents:6999});return}
 fetch('/api/signed-edition/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){if(s&&s.phase==='live')fill(s)}).catch(function(){});
})();
