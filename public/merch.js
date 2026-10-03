// Squish Squad Shop — merchandise design previews (Coming Soon).
// Checkout stays disabled until approved prices, fulfillment details and
// checkout links are supplied. Book checkout lives in app.js and is untouched.
(function(){
const M='assets/merch/';
// One image asset: base name, full-size and 720w dimensions.
const img=(name,w,h,sw,sh,alt)=>({name,w,h,sw,sh,alt});

const tee={
 white:img('squish-squad-tshirt-white',1400,726,720,374,'White Squish Squad T-shirt design: front view with Squish Man in his gold crown and blue cape beside Pudy under The Amazing Adventures of Squish Man banner, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 pink:img('squish-squad-tshirt-pink',1400,716,720,368,'Pink Squish Squad T-shirt design: front view with Squish Man and Pudy above The Amazing Adventures of Squish Man banner, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 blue:img('squish-squad-tshirt-blue',1400,697,720,359,'Blue Squish Squad T-shirt design: front view with Squish Man and Pudy above The Amazing Adventures of Squish Man banner, a back view with a gold crown, SQUISHMAN wordmark and white paw print, and a close-up of the print')
};
const hoodie={
 white:img('squish-squad-hoodie-white',1400,728,720,375,'White Squish Squad hoodie design: front view with Squish Man and Pudy artwork above the front pocket, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 pink:img('squish-squad-hoodie-pink',1400,702,720,361,'Pink Squish Squad hoodie design: front view with Squish Man and Pudy artwork above the front pocket, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 royal:img('squish-squad-hoodie-royal-blue',1400,711,720,366,'Royal-blue Squish Squad hoodie design: front view with Squish Man and Pudy artwork above the front pocket, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and white paw print')
};
const longSleeve=img('squish-squad-long-sleeve-white',1400,661,720,340,'White Squish Squad long-sleeve shirt design: front view with Squish Man and Pudy above The Amazing Adventures of Squish Man banner, a back view with a gold crown, SQUISHMAN wordmark and blue paw print, and a close-up of the print');
const pudy=img('pudy-plush-front-side-back',1146,602,720,378,'Pudy plush design shown from the front, side and back: a fluffy brown puppy with tan muzzle, chest and paws, floppy ears, a short stub tail and a royal-blue collar with a gold paw and the name PUDY');
const pudyDetail=img('pudy-plush-detail-views',492,342,0,0,'Close-up details of the Pudy plush design: embroidered brown eyes, the blue collar with an embroidered gold paw and PUDY name, and her short stub tail');
const bundles=img('squish-man-gift-bundles',1400,558,720,287,'Squish Man gift set designs in three boxes: the Squish Squad Starter Pack with a Squish Man plush, book, bookmark and sticker sheet; the Bedtime Adventure Set with a Pudy plush, book, pink character blanket and bookmark; and the Back-to-School Set with a royal-blue backpack, lunch box and water bottle');

// colors: [label, swatch hex, image] — only colors with their own image asset.
const categories=[
 {id:'merch-apparel',title:'Apparel',blurb:'Squish Man and Pudy, ready to wear.',items:[
  {name:'Squish Squad T-Shirt',desc:'Squish Man in his gold crown and royal-blue cape poses with best friend Pudy on the front, framed by stars, paw prints and The Amazing Adventures of Squish Man banner. The back keeps it simple with a gold crown, the SQUISHMAN wordmark and a paw print.',colors:[['White','#ffffff',tee.white],['Pink','#f59ac4',tee.pink],['Blue','#1747d8',tee.blue]]},
  {name:'Squish Squad Hoodie',desc:'The same bold, full-color Squish Man and Pudy artwork on a cozy pullover hoodie with a front pocket, plus the crown, wordmark and paw print across the back.',colors:[['White','#ffffff',hoodie.white],['Pink','#f59ac4',hoodie.pink],['Royal Blue','#1747d8',hoodie.royal]]},
  {name:'Squish Squad Long Sleeve',desc:'A long-sleeve take on the Squish Squad design: Squish Man and Pudy on the front, and the gold crown, SQUISHMAN wordmark and paw print on the back.',colors:[['White','#ffffff',longSleeve]]}
 ],more:['Pajamas'],moreNote:'More colors and pajama designs are on the way.'},
 {id:'merch-school',title:'School & Adventures',blurb:'Gear for the walk to Maple Hollow School and beyond.',items:[],
  more:['Backpacks','Lunch boxes','Water bottles','Hats','Tote bags'],moreNote:'Get a first peek at a royal-blue backpack, lunch box and water bottle in the Back-to-School Set.',peek:'bundles'},
 {id:'merch-cozy',title:'Cozy Collection',blurb:'Soft, snuggly friends for storytime and bedtime.',items:[
  {name:'Pudy Plush',desc:'Squish Man’s bigger best friend as a huggable plush: fluffy brown fur, a tan muzzle and paws, floppy ears and her royal-blue collar with a gold paw and the name PUDY. Even her short stub tail made it in.',colors:[['Brown with blue collar','#6b3a1e',pudy]],extra:[pudyDetail]}
 ],more:['Squish Man plush','Blankets','Pillows'],moreNote:'Spot a Squish Man plush and a pink character blanket in the gift set designs.',peek:'bundles'},
 {id:'merch-gifts',title:'Gifts & Activities',blurb:'Ready-to-give sets for every young adventurer.',items:[
  {key:'bundles',name:'Squish Man Gift Sets',desc:'Three gift-box designs in one collection. The Squish Squad Starter Pack pairs a Squish Man plush with a book, bookmark and sticker sheet. The Bedtime Adventure Set brings a Pudy plush, a pink Squish Man and Pudy blanket, a book and a bookmark. The Back-to-School Set packs a royal-blue character backpack, lunch box and water bottle.',sheet:true,colors:[['Full collection','',bundles]]}
 ],more:['Bookmarks','Stickers','Posters','Pins','Mugs','Puzzles'],moreNote:'More gift and activity designs are on the way.'}
];

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const srcset=i=>i.sw?`${M}${i.name}-720.webp 720w, ${M}${i.name}.webp ${i.w}w`:`${M}${i.name}.webp ${i.w}w`;
const small=i=>i.sw?[`${M}${i.name}-720.webp`,i.sw,i.sh]:[`${M}${i.name}.webp`,i.w,i.h];
const products=[];

function card(p){
 const n=products.push(p)-1,[first]=p.colors,[src,w,h]=small(first[2]);
 const multi=p.colors.length>1;
 const swatches=multi?`<div class="merch-colors" role="group" aria-label="${esc(p.name)} color">${p.colors.map((c,i)=>`<button type="button" class="merch-swatch" data-merch="${n}" data-color="${i}" aria-pressed="${i===0}" style="--sw:${c[1]}"><span class="merch-dot" aria-hidden="true"></span>${esc(c[0])}</button>`).join('')}</div>`:'';
 const shown=p.sheet?'Full design sheet shown':`Shown in ${esc(first[0].toLowerCase())}`;
 return `<article class="merch-card${p.sheet?' merch-card-wide':''}" id="merch-item-${n}">
 <div class="merch-art"><img src="${src}" srcset="${srcset(first[2])}" sizes="(max-width:700px) 92vw, ${p.sheet?'1100px':'560px'}" width="${w}" height="${h}" alt="${esc(first[2].alt)}" loading="lazy" decoding="async"></div>
 <div class="merch-body"><span class="merch-badge">COMING SOON</span><h4>${esc(p.name)}</h4><p>${esc(p.desc)}</p>
 ${swatches}<p class="merch-shown" aria-live="polite">${shown}</p>
 <dl class="merch-facts"><div><dt>Price</dt><dd>To be announced</dd></div><div><dt>Sizes &amp; materials</dt><dd>To be announced</dd></div></dl>
 <div class="merch-actions"><button type="button" class="merch-explore" data-gallery="${n}" aria-label="Explore the design: ${esc(p.name)}">EXPLORE THE DESIGN</button><button type="button" class="merch-checkout" disabled aria-label="Checkout coming soon: ${esc(p.name)}">CHECKOUT COMING SOON</button></div></div>
</article>`;
}
function moreTile(c){
 const peek=c.peek?`<button type="button" class="merch-explore merch-peek" data-gallery-key="${c.peek}">SEE THE GIFT SET DESIGNS</button>`:'';
 return `<article class="merch-more"><span class="merch-badge">COMING SOON</span><h4>${c.items.length?'More on the way':'Designs on the way'}</h4><ul>${c.more.map(m=>`<li>${esc(m)}</li>`).join('')}</ul><p>${esc(c.moreNote)}</p>${peek}</article>`;
}
const root=document.getElementById('merchCategories');
if(!root)return;
root.innerHTML=categories.map(c=>`<section class="merch-cat" id="${c.id}" aria-labelledby="${c.id}-h"><div class="merch-cat-head"><h3 id="${c.id}-h">${esc(c.title)}</h3><p>${esc(c.blurb)}</p></div><div class="merch-grid">${c.items.map(card).join('')}${moreTile(c)}</div></section>`).join('');

// Color selector: only products with a separate image per color get swatches.
root.addEventListener('click',e=>{
 const b=e.target.closest('.merch-swatch');if(!b)return;
 const p=products[+b.dataset.merch],c=p.colors[+b.dataset.color],cardEl=b.closest('.merch-card'),im=cardEl.querySelector('.merch-art img'),[src,w,h]=small(c[2]);
 im.src=src;im.srcset=srcset(c[2]);im.width=w;im.height=h;im.alt=c[2].alt;
 cardEl.querySelectorAll('.merch-swatch').forEach(s=>s.setAttribute('aria-pressed',String(s===b)));
 cardEl.querySelector('.merch-shown').textContent='Shown in '+c[0].toLowerCase();
 p.active=+b.dataset.color;
});

// Accessible gallery built on <dialog>: focus is contained while open, Escape
// closes it, arrow keys move between images, focus returns to the opener.
const dlg=document.getElementById('merchGallery'),gImg=dlg.querySelector('.mg-img'),gTitle=dlg.querySelector('#mgTitle'),gCap=dlg.querySelector('.mg-caption'),gCount=dlg.querySelector('.mg-count'),gPrev=dlg.querySelector('.mg-prev'),gNext=dlg.querySelector('.mg-next');
let slides=[],at=0,opener=null;
function show(i){
 at=(i+slides.length)%slides.length;const s=slides[at];
 gImg.src=`${M}${s.img.name}.webp`;gImg.width=s.img.w;gImg.height=s.img.h;gImg.alt=s.img.alt;
 gCap.textContent=s.label;gCount.textContent=slides.length>1?`Image ${at+1} of ${slides.length}`:'';
 gPrev.hidden=gNext.hidden=slides.length<2;
}
function open(p,from){
 const start=p.active||0,ordered=p.colors.slice(start).concat(p.colors.slice(0,start));
 slides=ordered.map(c=>({img:c[2],label:p.sheet?`${p.name} — full design sheet`:`${p.name} — ${c[0]}`})).concat((p.extra||[]).map(x=>({img:x,label:`${p.name} — detail views`})));
 opener=from;gTitle.textContent=p.name;show(0);
 if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
 dlg.querySelector('.mg-close').focus();
}
document.addEventListener('click',e=>{
 const g=e.target.closest('[data-gallery],[data-gallery-key]');if(!g)return;
 const p=g.dataset.galleryKey?products.find(x=>x.key===g.dataset.galleryKey):products[+g.dataset.gallery];
 if(p)open(p,g);
});
function close(){if(dlg.open){dlg.close?dlg.close():dlg.removeAttribute('open')}}
dlg.querySelector('.mg-close').addEventListener('click',close);
gPrev.addEventListener('click',()=>show(at-1));gNext.addEventListener('click',()=>show(at+1));
dlg.addEventListener('click',e=>{if(e.target===dlg)close()});
dlg.addEventListener('keydown',e=>{
 if(e.key==='ArrowLeft'&&slides.length>1){e.preventDefault();show(at-1)}
 else if(e.key==='ArrowRight'&&slides.length>1){e.preventDefault();show(at+1)}
 else if(e.key==='Escape'&&!dlg.close){close()}
 else if(e.key==='Tab'){ // keep keyboard focus inside the open gallery
  const f=[...dlg.querySelectorAll('button')].filter(b=>!b.hidden);
  const i=f.indexOf(document.activeElement),last=f.length-1;
  if(e.shiftKey&&i<=0){e.preventDefault();f[last].focus()}
  else if(!e.shiftKey&&(i===last||i<0)){e.preventDefault();f[0].focus()}
 }
});
dlg.addEventListener('close',()=>{gImg.removeAttribute('src');if(opener)opener.focus()});
})();
