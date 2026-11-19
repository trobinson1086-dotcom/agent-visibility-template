// Squish Man's own visit counter (see src/stats). No cookies and no IDs: it sends
// the page, where the visit came from, and clicks on Buy / sign-up / social
// buttons to /api/mh. The owner's browser (marked by the stats page) is skipped.
(function(){
try{
var d=document,l=location,n=navigator,ls=null,ss=null;
try{ls=window.localStorage}catch(e){}
try{ss=window.sessionStorage}catch(e){}
var q=new URLSearchParams(l.search);
if(q.get('sm_owner')==='off'&&ls){ls.removeItem('sm_owner')}
var test=q.get('sm_test')==='1';
if(!test&&(!/(^|\.)squishman\.com$/.test(l.hostname)||n.webdriver))return;
if(ls&&ls.getItem('sm_owner')==='1'&&!test)return;
function host(u){try{return new URL(u).hostname}catch(e){return''}}
var ref=host(d.referrer),self=l.hostname,internal=ref&&ref.replace(/^www\./,'')===self.replace(/^www\./,'');
// The visit's source: set on the first page of a visit, carried by every later event.
var src=null,entry=0;
try{src=ss&&JSON.parse(ss.getItem('sm_src')||'null')}catch(e){}
var utm=q.get('utm_source')||q.get('ref')||q.get('src');
if(!src||(!internal&&(ref||utm)&&!/(^|\.)stripe\.com$/.test(ref))){
 var c=[];['gclid','fbclid','ttclid'].forEach(function(k){if(q.get(k))c.push(k)});
 src={r:internal?'':ref,us:utm||'',um:q.get('utm_medium')||'',uc:q.get('utm_campaign')||'',ut:q.get('utm_content')||'',c:c};
 entry=1;try{ss&&ss.setItem('sm_src',JSON.stringify(src))}catch(e){}
}
var rv=0;try{rv=ls&&ls.getItem('sm_seen')==='1'?1:0;ls&&ls.setItem('sm_seen','1')}catch(e){}
var keep=new URLSearchParams();['book','shop'].forEach(function(k){var v=q.get(k);if(v)keep.set(k,v)});
var path=l.pathname+(keep.toString()?'?'+keep:'');
var tm=n.maxTouchPoints>1?1:0;
function send(k,x){
 var b={k:k,p:path,s:src,tm:tm,lg:(n.language||'').slice(0,12),x:test?1:0};
 if(x)for(var i in x)b[i]=x[i];
 var s=JSON.stringify(b);
 try{if(n.sendBeacon&&n.sendBeacon('/api/mh',new Blob([s],{type:'text/plain'})))return}catch(e){}
 try{fetch('/api/mh',{method:'POST',body:s,keepalive:true,headers:{'content-type':'text/plain'}})}catch(e){}
}
send('view',{e:entry,rv:rv});
// Time actually spent looking at the page, sent in pieces when the page is hidden.
var since=d.visibilityState==='visible'?Date.now():0,acc=0;
function flush(){if(since){acc+=(Date.now()-since)/1000;since=0}if(acc>=1){send('time',{t:Math.round(acc)});acc=0}}
d.addEventListener('visibilitychange',function(){if(d.visibilityState==='hidden')flush();else since=Date.now()});
addEventListener('pagehide',flush);
function txt(el){return(el&&(el.getAttribute('aria-label')||el.textContent)||'').replace(/\s+/g,' ').trim().slice(0,60)}
function what(el){
 var card=el.closest('.card,.merch-card,.squad-tier,.tier,article,.modal,.hero-book,section');
 var h=card&&card.querySelector('h1,h2,h3,h4');
 var t=h?txt(h):'';var b=txt(el);
 return (t&&t!==b?t+' \u00b7 ':'')+b;
}
d.addEventListener('click',function(e){
 var el=e.target&&e.target.closest&&e.target.closest('a,button');if(!el)return;
 if(el.matches('[data-buy]')){send('buy',{l:what(el)});return}
 var href=el.getAttribute('href')||'';
 if(/\/api\/bundle\/checkout/.test(href)){send('buy',{l:what(el)});return}
 if(/^mailto:/i.test(href)){send('email',{l:href.slice(7).split('?')[0]});return}
 var h=href&&host(el.href);
 if(/(^|\.)stripe\.com$/.test(h)){send('buy',{l:what(el)});return}
 if(/instagram|tiktok|facebook|youtube|youtu\.be|pinterest/.test(h)){send('social',{l:h.replace(/^www\./,'')});return}
 if(h&&h!==self){send('out',{l:h.replace(/^www\./,'')});return}
 if(/look inside|peek|preview/i.test(txt(el))||el.matches('[data-peek],.peek')){send('peek',{l:what(el)})}
},true);
d.addEventListener('submit',function(e){
 var f=e.target;if(!f||!f.id)return;
 if(/squad/i.test(f.id))send('signup',{l:'Squish Squad updates'});
 else if(/contact/i.test(f.id))send('contact',{l:'Contact form'});
},true);
}catch(e){}
})();
