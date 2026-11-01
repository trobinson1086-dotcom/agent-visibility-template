const A='assets/covers/';
const sets={
 english:[
  ['drive_master/Squish Man Book 1 - The Missing Puppy Parade.png','Book 1 — Missing Puppy Parade','https://book.stripe.com/8x29AN3B77ancW93Fz1Jm38','https://buy.stripe.com/bJe3cpgnTamz09n5NH1Jm3i','https://buy.stripe.com/8x27sF8Vr3Yb4pDdg91Jm3n','https://book.stripe.com/6oU5kx2x3dyL4pD2Bv1Jm2Y'],
  ['6542(4).png','Book 2 — Big Dream Adventure','https://book.stripe.com/28E8wJb3z66j4pDa3X1Jm39','https://buy.stripe.com/fZufZbdbH3Yb1drb811Jm3j','https://buy.stripe.com/28EdR31sZ0LZ6xLcc51Jm3o','https://book.stripe.com/cNi3cpc7D2U75tHcc51Jm2Z'],
  ['6543(5).png','Book 3 — Magical Garden','https://book.stripe.com/fZu8wJefL7an1dr2Bv1Jm3a','https://buy.stripe.com/14A14h9ZvdyL9JXekd1Jm3k','https://buy.stripe.com/00w3cpgnTeCPf4hekd1Jm3p','https://book.stripe.com/14A8wJ7RneCP5tH0tn1Jm30'],
  ['6540(5).png','Book 4 — Saves the Snow Day','https://book.stripe.com/3cI00d0oVbqDcW92Bv1Jm3b','https://buy.stripe.com/5kQ9ANdbHeCPbS58ZT1Jm3l','https://buy.stripe.com/cNi14hb3z0LZf4hfoh1Jm3q','https://book.stripe.com/5kQ28lfjP52f1dr3Fz1Jm31'],
  ['6541(5).png','Book 5 — Great Maple Hollow Derby','https://book.stripe.com/aFa28l3B7fGT8FTa3X1Jm3c','https://buy.stripe.com/7sY5kx5JfdyL3lza3X1Jm3m','https://buy.stripe.com/6oUeV74Fbamz8FT6RL1Jm3r','https://book.stripe.com/5kQ4gt7Rn0LZ9JX7VP1Jm32']
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
 spanish:[['drive_master/Squish Man Spanish Book 1 - Squish Man y el Desfile del Cachorro Perdido.png','Libro 1 — Español','https://book.stripe.com/3cIcMZ1sZeCP8FT5NH1Jm3d','https://book.stripe.com/6oUdR37Rn0LZ8FTa3X1Jm33'],['drive_master/Squish Man Spanish Book 2 - La Gran Aventura del Gran Sueno.png','Libro 2 — Español','https://book.stripe.com/9B614h5Jf1Q3f4h6RL1Jm3e','https://book.stripe.com/eVqcMZ5Jf52fcW91xr1Jm34'],['drive_master/Squish Man Spanish Book 3 - Squish Man y el Jardin Magico.png','Libro 3 — Español','https://book.stripe.com/cNibIVdbH52fcW94JD1Jm3f','https://book.stripe.com/eVqbIVc7D1Q35tHekd1Jm35'],['drive_master/Squish Man Spanish Book 4 - Squish Man Salva el Dia de Nieve.png','Libro 4 — Español','https://book.stripe.com/cNifZb0oV0LZ3lz1xr1Jm3g','https://book.stripe.com/cNiaER0oV8eraO10tn1Jm36'],['drive_master/Squish Man Spanish Book 5 - Squish Man y Pudy y el Gran Derby de Maple Hollow.png','Libro 5 — Español','https://book.stripe.com/cNi3cp5Jf52f1drfoh1Jm3h','https://book.stripe.com/8x26oB6Nj66jcW98ZT1Jm37'],['7601.png','Edición Especial 1','https://book.stripe.com/fZucMZ9Zv52f09ndg91Jm2J'],['7602.png','Edición Especial 2','https://book.stripe.com/9B6dR3c7D2U71dr6RL1Jm2K'],['7603.png','Edición Especial 3','https://book.stripe.com/5kQ00d9Zv2U7aO14JD1Jm2L'],['7604.png','Edición Especial 4','https://book.stripe.com/4gM7sFfjP66jg8l2Bv1Jm2M'],['7605.png','Edición Especial 5','https://book.stripe.com/fZu3cp2x31Q3g8lcc51Jm2N'],['7611.png','Aprendizaje y Actividades 1','https://book.stripe.com/8x2bIVb3zfGT8FT5NH1Jm2O'],['7612.png','Aprendizaje y Actividades 2','https://book.stripe.com/fZucMZ6NjeCPf4h2Bv1Jm2P'],['7613.png','Aprendizaje y Actividades 3','https://book.stripe.com/28EeV74FbcuHf4h0tn1Jm2Q'],['7614.png','Aprendizaje y Actividades 4','https://book.stripe.com/8x2eV71sZbqD7BPa3X1Jm2R'],['7615.png','Aprendizaje y Actividades 5','https://book.stripe.com/00wfZb0oVcuHaO1ekd1Jm2S']],
 color:[['drive_master/Squish Man Coloring Book.png.jpg','Coloring Book 1','https://book.stripe.com/aFa14hgnT2U7cW98ZT1Jm2T'],['drive_master/Squish Man Coloring Book - Book 2.png.jpg','Coloring Book 2','https://book.stripe.com/7sYdR38Vr3Ybe0d5NH1Jm2U'],['drive_master/Squish Man Coloring Book - Book 3.png.jpg','Coloring Book 3','https://book.stripe.com/aFa5kxgnT52f4pD5NH1Jm2V'],['drive_master/Squish Man Coloring Book - Book 4.png.jpg','Coloring Book 4','https://book.stripe.com/00wfZb4FbbqDf4hdg91Jm2W'],['drive_master/Squish Man Coloring Book - Book 5.png.jpg','Coloring Book 5','https://book.stripe.com/28EaERefLcuHaO10tn1Jm2X']]
};
function render(id,items,price){document.getElementById(id).innerHTML=items.map(x=>{
 const standard=id==='english', libro=id==='spanishgrid'&&x[1].startsWith('Libro');
 const detail=`product.html?cover=${encodeURIComponent(x[0])}&title=${encodeURIComponent(x[1])}&price=${encodeURIComponent(price)}&checkout=${encodeURIComponent(x[2]||'')}&paperback=${encodeURIComponent(standard||libro?(x[2]||''):'')}&ebook=${encodeURIComponent(standard?(x[3]||''):'')}&audiobook=${encodeURIComponent(standard?(x[4]||''):'')}&hardcover=${encodeURIComponent(standard?(x[5]||''):libro?(x[3]||''):'')}`;
 const es=id==='spanishgrid', buy=es?'COMPRAR AHORA':'BUY NOW';
 return `<article class="card"${es?' lang="es"':''}><img src="${A+x[0]}" alt="${x[1]} ${es?'portada':'cover'}" loading="lazy"><h3>${x[1]}</h3><div class="price">${es?price.replace('From','Desde'):price}</div><a class="details" href="${detail}">${es?'Ver el interior · Detalles del libro':'Look Inside · Product details'}</a>${x[2]?`<a class="buy-link" href="${x[2]}" target="_blank" rel="noopener">${buy}</a>`:`<button data-placeholder>${buy}</button>`}</article>`
}).join('')}
render('english',sets.english,'Paperback $14.99');render('bonusgrid',sets.bonus,'$39.99');render('learninggrid',sets.learning,'$19.99');render('spanishgrid',sets.spanish,'From $14.99');render('colorgrid',sets.color,'$18.99');
document.addEventListener('click',e=>{if(e.target.matches('[data-placeholder]'))alert('Coming soon! To order now, email orders@squishman.com and we will help you.')});

const modal=document.getElementById('productModal');
document.addEventListener('click',e=>{
 const d=e.target.closest('[data-product]');
 if(d){const c=d.closest('.card');document.getElementById('modalCover').src=c.querySelector('img').src;document.getElementById('modalTitle').textContent=c.querySelector('h3').textContent;document.getElementById('modalPrice').textContent=c.querySelector('.price').textContent;const live=c.querySelector('.buy-link');const mb=document.getElementById('modalBuy');if(live){mb.href=live.href;mb.textContent='BUY NOW';mb.target='_blank'}else{mb.removeAttribute('href');mb.textContent='CHECKOUT COMING SOON';mb.removeAttribute('target')}modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
 if(e.target.matches('.modalclose')||e.target===modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
});
