const A='assets/covers/';
// The shelves come from books.js (one list of every book, its prices and its
// Stripe links). Each card links to its book page by id: product.html?book=book-1.
const BOOKS=window.SQUISH_BOOKS||[];
const SHELVES={english:'english',bonus:'bonusgrid',learning:'learninggrid',spanish:'spanishgrid',color:'colorgrid'};
const escHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function card(b){
 const es=b.shelf==='spanish', buy=es?'COMPRAR AHORA':'BUY NOW', link=b.paperback||b.checkout;
 const name=b.name?`${b.label}: ${b.name}`:b.label;
 const start=b.id==='book-1'?'<span class="start-here">START HERE</span>':'';
 return `<article class="card${start?' card-start':''}"${es?' lang="es"':''}>${start}<img src="${A+'400/'+encodeURI(b.cover)}" srcset="${A+'400/'+encodeURI(b.cover)} 400w, ${A+encodeURI(b.cover)} 900w" sizes="(max-width:600px) 45vw, 240px" width="400" height="549" alt="${escHtml(name)} ${es?'portada':'cover'}" loading="lazy" decoding="async"><h3>${escHtml(name)}</h3><div class="price">${escHtml(b.price)}</div><a class="details" href="product.html?book=${encodeURIComponent(b.id)}">${es?'Ver el interior · Detalles del libro':'Look Inside · Product details'}</a>${link?`<a class="buy-link" href="${escHtml(link)}" target="_blank" rel="noopener">${buy}</a>`:`<button data-placeholder>${buy}</button>`}</article>`;
}
Object.entries(SHELVES).forEach(([shelf,id])=>{const el=document.getElementById(id);if(el)el.innerHTML=BOOKS.filter(b=>b.shelf===shelf).map(card).join('')});
document.addEventListener('click',e=>{if(e.target.matches('[data-placeholder]'))alert('Coming soon! To order now, email orders@squishman.com and we will help you.')});

const modal=document.getElementById('productModal');
document.addEventListener('click',e=>{
 const d=e.target.closest('[data-product]');
 if(d){const c=d.closest('.card');document.getElementById('modalCover').src=c.querySelector('img').src;document.getElementById('modalTitle').textContent=c.querySelector('h3').textContent;document.getElementById('modalPrice').textContent=c.querySelector('.price').textContent;const live=c.querySelector('.buy-link');const mb=document.getElementById('modalBuy');if(live){mb.href=live.href;mb.textContent='BUY NOW';mb.target='_blank'}else{mb.removeAttribute('href');mb.textContent='CHECKOUT COMING SOON';mb.removeAttribute('target')}modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
 if(e.target.matches('.modalclose')||e.target===modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
});

// Featured YouTube video: show the thumbnail until clicked, then load the player.
document.querySelectorAll('.yt-facade').forEach(btn=>btn.addEventListener('click',()=>{
 const f=document.createElement('iframe');
 f.className='featured-video featured-embed';
 f.src='https://www.youtube-nocookie.com/embed/'+btn.dataset.yt+'?autoplay=1&rel=0&modestbranding=1&playsinline=1';
 f.title=btn.dataset.title;
 f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
 f.referrerPolicy='strict-origin-when-cross-origin';
 f.allowFullscreen=true;
 btn.replaceWith(f);
}));

// Phone "Start with Book 1" bar: shows once the hero's Book 1 card has scrolled
// away, and steps aside while a book shelf, a form or the footer is on screen.
(()=>{const bar=document.querySelector('.sticky-book1'),start=document.querySelector('.start-book1');
 if(!bar||!start||!('IntersectionObserver' in window))return;
 document.body.classList.add('has-sticky');
 const hide=new Set();let pastHero=false;
 const update=()=>bar.classList.toggle('show',pastHero&&hide.size===0);
 new IntersectionObserver(([e])=>{pastHero=!e.isIntersecting&&e.boundingClientRect.top<0;update()}).observe(start);
 const io=new IntersectionObserver(es=>{es.forEach(e=>e.isIntersecting?hide.add(e.target):hide.delete(e.target));update()});
 document.querySelectorAll('#books,#squad-join,#contact,footer').forEach(el=>io.observe(el));
})();

// Holiday banner: shows only between its data-start and data-end times (Eastern),
// or on any page opened with ?holiday=preview so it can be checked before the sale.
(function(){var b=document.querySelector('.holiday-bar');if(!b)return;var now=Date.now(),s=Date.parse(b.dataset.start),e=Date.parse(b.dataset.end);var preview=/[?&]holiday=preview\b/.test(location.search);if(preview||(now>=s&&now<e))b.hidden=false;})();
