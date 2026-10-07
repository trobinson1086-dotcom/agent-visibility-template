const A='assets/covers/';
const sets={
 english:[
  ['drive_master/Squish Man Book 1 - The Missing Puppy Parade.png','Book 1 — Missing Puppy Parade','https://book.stripe.com/7sYaER9ZvcuH6xL2Bv1Jm2f','https://buy.stripe.com/7sY14h8VrfGT3lz7VP1Jm2g','https://buy.stripe.com/14AeV71sZ2U75tHb811Jm2h','https://book.stripe.com/6oU5kx2x3dyL4pD2Bv1Jm2Y'],
  ['6542(4).png','Book 2 — Big Dream Adventure','https://book.stripe.com/9B614hgnT7an2hvfoh1Jm2i','https://buy.stripe.com/3cIdR37RngKX8FTfoh1Jm2j','https://buy.stripe.com/28E28l4Fb9iv4pD7VP1Jm2k','https://book.stripe.com/cNi3cpc7D2U75tHcc51Jm2Z'],
  ['6543(5).png','Book 3 — Magical Garden','https://book.stripe.com/bJeeV7gnTeCPaO1foh1Jm2l','https://buy.stripe.com/dRmfZb5Jf0LZe0ddg91Jm2m','https://buy.stripe.com/aFafZb0oVfGT7BP7VP1Jm2n','https://book.stripe.com/14A8wJ7RneCP5tH0tn1Jm30'],
  ['6540(5).png','Book 4 — Saves the Snow Day','https://book.stripe.com/00w28l4Fbamz6xL7VP1Jm2o','https://buy.stripe.com/aFaeV74Fb8er09nfoh1Jm2p','https://buy.stripe.com/4gM28ldbHgKXcW95NH1Jm2q','https://book.stripe.com/5kQ28lfjP52f1dr3Fz1Jm31'],
  ['6541(5).png','Book 5 — Great Maple Hollow Derby','https://book.stripe.com/14A14h7Rn8er1dr0tn1Jm2r','https://buy.stripe.com/cNi7sFb3zcuH8FT3Fz1Jm2s','https://buy.stripe.com/8x26oB9Zv7anf4h3Fz1Jm2t','https://book.stripe.com/5kQ4gt7Rn0LZ9JX7VP1Jm32']
 ],
 bonus:[
  ['7594.png','Bonus Edition Book 1','https://buy.stripe.com/14AaER9ZveCP9JX5NH1Jm2u'],
  ['7595.png','Bonus Edition Book 2','https://buy.stripe.com/00w8wJc7DfGTe0d0tn1Jm2v'],
  ['7596.png','Bonus Edition Book 3','https://buy.stripe.com/8x214h2x33Yb8FTgsl1Jm2w'],
  ['7597.png','Bonus Edition Book 4','https://buy.stripe.com/6oUeV79Zv0LZ9JX3Fz1Jm2x'],
  ['7598.png','Bonus Edition Book 5','https://buy.stripe.com/fZu14hdbH1Q3bS57VP1Jm2y']
 ],
 learning:[
  ['7610.png','Learning & Activity Book 1','https://book.stripe.com/14AfZb0oVbqD2hv3Fz1Jm2z'],
  ['drive_master/Squish Man Book 2 - Squish Mans Big Dream Adventure - Learning and Activity Book.png','Learning & Activity Book 2','https://book.stripe.com/fZuaER4Fb52f3lzcc51Jm2A'],
  ['drive_master/Squish Man Book 3 - Squish Man and the Magical Garden - Learning and Activity Book.png','Learning & Activity Book 3','https://book.stripe.com/8x25kxefLdyL9JXdg91Jm2B'],
  ['drive_master/Squish Man Book 4 - Squish Man Saves the Snow Day - Learning and Activity Book.png','Learning & Activity Book 4','https://book.stripe.com/9B6fZbefL3Yb3lz2Bv1Jm2C'],
  ['drive_master/Squish Man Book 5 - Squish Man Pudy and the Great Maple Hollow Derby - Learning and Activity Book.png','Learning & Activity Book 5','https://book.stripe.com/00w14hc7Damz6xLekd1Jm2D']
 ],
 spanish:[['drive_master/Squish Man Spanish Book 1 - Squish Man y el Desfile del Cachorro Perdido.png','Libro 1 — Español','https://book.stripe.com/cNi9ANfjP2U75tH5NH1Jm2E','https://book.stripe.com/6oUdR37Rn0LZ8FTa3X1Jm33'],['drive_master/Squish Man Spanish Book 2 - La Gran Aventura del Gran Sueno.png','Libro 2 — Español','https://book.stripe.com/14A6oB3B78ercW98ZT1Jm2F','https://book.stripe.com/eVqcMZ5Jf52fcW91xr1Jm34'],['drive_master/Squish Man Spanish Book 3 - Squish Man y el Jardin Magico.png','Libro 3 — Español','https://book.stripe.com/00wfZbb3z3YbcW98ZT1Jm2G','https://book.stripe.com/eVqbIVc7D1Q35tHekd1Jm35'],['drive_master/Squish Man Spanish Book 4 - Squish Man Salva el Dia de Nieve.png','Libro 4 — Español','https://book.stripe.com/6oUfZb3B72U7f4h3Fz1Jm2H','https://book.stripe.com/cNiaER0oV8eraO10tn1Jm36'],['drive_master/Squish Man Spanish Book 5 - Squish Man y Pudy y el Gran Derby de Maple Hollow.png','Libro 5 — Español','https://book.stripe.com/14AaER3B78er5tHb811Jm2I','https://book.stripe.com/8x26oB6Nj66jcW98ZT1Jm37'],['7601.png','Edición Especial 1','https://book.stripe.com/fZucMZ9Zv52f09ndg91Jm2J'],['7602.png','Edición Especial 2','https://book.stripe.com/9B6dR3c7D2U71dr6RL1Jm2K'],['7603.png','Edición Especial 3','https://book.stripe.com/5kQ00d9Zv2U7aO14JD1Jm2L'],['7604.png','Edición Especial 4','https://book.stripe.com/4gM7sFfjP66jg8l2Bv1Jm2M'],['7605.png','Edición Especial 5','https://book.stripe.com/fZu3cp2x31Q3g8lcc51Jm2N'],['7611.png','Aprendizaje y Actividades 1','https://book.stripe.com/8x2bIVb3zfGT8FT5NH1Jm2O'],['7612.png','Aprendizaje y Actividades 2','https://book.stripe.com/fZucMZ6NjeCPf4h2Bv1Jm2P'],['7613.png','Aprendizaje y Actividades 3','https://book.stripe.com/28EeV74FbcuHf4h0tn1Jm2Q'],['7614.png','Aprendizaje y Actividades 4','https://book.stripe.com/8x2eV71sZbqD7BPa3X1Jm2R'],['7615.png','Aprendizaje y Actividades 5','https://book.stripe.com/00wfZb0oVcuHaO1ekd1Jm2S']],
 color:[['drive_master/Squish Man Coloring Book.png.jpg','Coloring Book 1','https://book.stripe.com/aFa14hgnT2U7cW98ZT1Jm2T'],['drive_master/Squish Man Coloring Book - Book 2.png.jpg','Coloring Book 2','https://book.stripe.com/7sYdR38Vr3Ybe0d5NH1Jm2U'],['drive_master/Squish Man Coloring Book - Book 3.png.jpg','Coloring Book 3','https://book.stripe.com/aFa5kxgnT52f4pD5NH1Jm2V'],['drive_master/Squish Man Coloring Book - Book 4.png.jpg','Coloring Book 4','https://book.stripe.com/00wfZb4FbbqDf4hdg91Jm2W'],['drive_master/Squish Man Coloring Book - Book 5.png.jpg','Coloring Book 5','https://book.stripe.com/28EaERefLcuHaO10tn1Jm2X']]
};
function render(id,items,price){document.getElementById(id).innerHTML=items.map(x=>{
 const standard=id==='english', libro=id==='spanishgrid'&&x[1].startsWith('Libro');
 const detail=`product.html?cover=${encodeURIComponent(x[0])}&title=${encodeURIComponent(x[1])}&price=${encodeURIComponent(price)}&checkout=${encodeURIComponent(x[2]||'')}&paperback=${encodeURIComponent(standard||libro?(x[2]||''):'')}&ebook=${encodeURIComponent(standard?(x[3]||''):'')}&audiobook=${encodeURIComponent(standard?(x[4]||''):'')}&hardcover=${encodeURIComponent(standard?(x[5]||''):libro?(x[3]||''):'')}`;
 return `<article class="card"><img src="${A+x[0]}" alt="${x[1]} cover" loading="lazy"><h3>${x[1]}</h3><div class="price">${price}</div><a class="details" href="${detail}">Look Inside · Product details</a>${x[2]?`<a class="buy-link" href="${x[2]}" target="_blank" rel="noopener">BUY NOW</a>`:`<button data-placeholder>BUY NOW</button>`}</article>`
}).join('')}
render('english',sets.english,'Paperback $19.99');render('bonusgrid',sets.bonus,'$39.99');render('learninggrid',sets.learning,'$19.99');render('spanishgrid',sets.spanish,'From $19.99');render('colorgrid',sets.color,'$18.99');
document.addEventListener('click',e=>{if(e.target.matches('[data-placeholder]'))alert('This feature is ready for your real checkout, video, review, or product link before launch.')});

const modal=document.getElementById('productModal');
document.addEventListener('click',e=>{
 const d=e.target.closest('[data-product]');
 if(d){const c=d.closest('.card');document.getElementById('modalCover').src=c.querySelector('img').src;document.getElementById('modalTitle').textContent=c.querySelector('h3').textContent;document.getElementById('modalPrice').textContent=c.querySelector('.price').textContent;const live=c.querySelector('.buy-link');const mb=document.getElementById('modalBuy');if(live){mb.href=live.href;mb.textContent='BUY NOW';mb.target='_blank'}else{mb.removeAttribute('href');mb.textContent='CHECKOUT COMING SOON';mb.removeAttribute('target')}modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
 if(e.target.matches('.modalclose')||e.target===modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
});
