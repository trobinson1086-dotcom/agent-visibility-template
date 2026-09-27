const A='assets/covers/';
const sets={
 english:[
  ['drive_master/Squish Man Book 1 - The Missing Puppy Parade.png','Book 1 — Missing Puppy Parade','https://book.stripe.com/14AeV7dbH8erg8lcc51Jm1Z','https://buy.stripe.com/14A6oB5Jf3YbbS5gsl1Jm08','https://buy.stripe.com/5kQcMZ7Rn52f2hv4JD1Jm0q'],
  ['6542-4.png','Book 2 — Big Dream Adventure','https://book.stripe.com/fZu9AN3B72U709nekd1Jm0b','https://buy.stripe.com/28E4gt2x32U7g8l2Bv1Jm0d','https://buy.stripe.com/fZu6oB6Nj0LZaO1b811Jm0r'],
  ['6543-5.png','Book 3 — Magical Garden','https://book.stripe.com/6oU9ANgnTbqD5tHcc51Jm0g','https://buy.stripe.com/cNifZb5Jf9iv2hvfoh1Jm0i','https://buy.stripe.com/3cI3cp4Fb2U709n8ZT1Jm0s'],
  ['6540-5.png','Book 4 — Saves the Snow Day','https://book.stripe.com/dRmbIVefL9ivcW91xr1Jm0l','https://buy.stripe.com/fZu5kx4Fb2U72hvcc51Jm0n','https://buy.stripe.com/14A14h0oV66j3lz0tn1Jm0t'],
  ['6541-5.png','Book 5 — Great Maple Hollow Derby','https://book.stripe.com/4gMcMZ9ZvamzbS54JD1Jm0u','https://buy.stripe.com/8x25kxc7DcuH3lz7VP1Jm0w','https://buy.stripe.com/00wbIV7Rn7an2hv3Fz1Jm0x']
 ],
 bonus:[
  ['7594.png','Bonus Edition Book 1','https://buy.stripe.com/9B6eV79Zv7anbS5foh1Jm02'],
  ['7595.png','Bonus Edition Book 2','https://buy.stripe.com/fZu14h0oVgKXcW9a3X1Jm03'],
  ['7596.png','Bonus Edition Book 3','https://buy.stripe.com/4gMeV74FbcuH7BP3Fz1Jm04'],
  ['7597.png','Bonus Edition Book 4','https://buy.stripe.com/cNieV70oVgKXg8l0tn1Jm05'],
  ['7598.png','Bonus Edition Book 5','https://buy.stripe.com/6oU8wJb3z52f09n7VP1Jm06']
 ],
 learning:[
  ['7610.png','Learning & Activity Book 1','https://book.stripe.com/cNi4gt4FbfGT9JX4JD1Jm09'],
  ['drive_master/Squish Man Book 2 - Squish Mans Big Dream Adventure - Learning and Activity Book.png','Learning & Activity Book 2','https://book.stripe.com/9B6aERdbHamz3lza3X1Jm0e'],
  ['drive_master/Squish Man Book 3 - Squish Man and the Magical Garden - Learning and Activity Book.png','Learning & Activity Book 3','https://book.stripe.com/dRm4gtdbH9iv4pD4JD1Jm0j'],
  ['drive_master/Squish Man Book 4 - Squish Man Saves the Snow Day - Learning and Activity Book.png','Learning & Activity Book 4','https://book.stripe.com/28E5kx2x37anf4hekd1Jm0o'],
  ['drive_master/Squish Man Book 5 - Squish Man Pudy and the Great Maple Hollow Derby - Learning and Activity Book.png','Learning & Activity Book 5','https://book.stripe.com/eVq8wJ6Nj7an9JXdg91Jm0y']
 ],
 spanish:[['drive_master/Squish Man Spanish Book 1 - Squish Man y el Desfile del Cachorro Perdido.png','Libro 1 — Español','https://book.stripe.com/dRm5kx9Zv66j1dr4JD1Jm20'],['drive_master/Squish Man Spanish Book 2 - La Gran Aventura del Gran Sueno.png','Libro 2 — Español','https://book.stripe.com/5kQbIVdbHcuH9JX4JD1Jm23'],['drive_master/Squish Man Spanish Book 3 - Squish Man y el Jardin Magico.png','Libro 3 — Español','https://book.stripe.com/eVq7sFefLgKX1dra3X1Jm26'],['drive_master/Squish Man Spanish Book 4 - Squish Man Salva el Dia de Nieve.png','Libro 4 — Español','https://book.stripe.com/3cIdR33B7bqD5tHdg91Jm29'],['drive_master/Squish Man Spanish Book 5 - Squish Man y Pudy y el Gran Derby de Maple Hollow.png','Libro 5 — Español','https://book.stripe.com/9B6cMZefL8er7BP0tn1Jm2c'],['7601.png','Edición Especial 1','https://book.stripe.com/8x2cMZ0oV8er9JX6RL1Jm21'],['7602.png','Edición Especial 2','https://book.stripe.com/aFa4gtfjPbqDaO12Bv1Jm24'],['7603.png','Edición Especial 3','https://book.stripe.com/dRm9ANc7D1Q32hvdg91Jm27'],['7604.png','Edición Especial 4','https://book.stripe.com/5kQbIV3B72U709n6RL1Jm2a'],['7605.png','Edición Especial 5','https://book.stripe.com/eVq9ANfjPeCP8FT1xr1Jm2d'],['7611.png','Aprendizaje y Actividades 1','https://book.stripe.com/4gM00dgnTbqDg8l0tn1Jm1E'],['7612.png','Aprendizaje y Actividades 2','https://book.stripe.com/bJe5kxdbH66j4pDgsl1Jm1F'],['7613.png','Aprendizaje y Actividades 3','https://book.stripe.com/aFa28l9Zv0LZ4pDb811Jm1G'],['7614.png','Aprendizaje y Actividades 4','https://book.stripe.com/fZu5kxefL7an2hv3Fz1Jm1H'],['7615.png','Aprendizaje y Actividades 5','https://book.stripe.com/8x2eV72x3gKX4pDgsl1Jm1I']],
 color:[['drive_master/Squish Man Coloring Book.png.jpg','Coloring Book 1','https://book.stripe.com/7sY9ANb3z66j1dr5NH1Jm22'],['drive_master/Squish Man Coloring Book - Book 2.png.jpg','Coloring Book 2','https://book.stripe.com/cNieV7c7D2U75tHgsl1Jm25'],['drive_master/Squish Man Coloring Book - Book 3.png.jpg','Coloring Book 3','https://book.stripe.com/dRmfZbc7DdyL2hv5NH1Jm28'],['drive_master/Squish Man Coloring Book - Book 4.png.jpg','Coloring Book 4','https://book.stripe.com/4gMdR36NjeCPf4hdg91Jm2b'],['drive_master/Squish Man Coloring Book - Book 5.png.jpg','Coloring Book 5','https://book.stripe.com/8x228l9Zv3Yb4pD5NH1Jm2e']]
};
function render(id,items,price){document.getElementById(id).innerHTML=items.map(x=>{
 const standard=id==='english';
 const detail=`product.html?cover=${encodeURIComponent(x[0])}&title=${encodeURIComponent(x[1])}&price=${encodeURIComponent(price)}&checkout=${encodeURIComponent(x[2]||'')}&paperback=${encodeURIComponent(standard?(x[2]||''):'')}&ebook=${encodeURIComponent(standard?(x[3]||''):'')}&audiobook=${encodeURIComponent(standard?(x[4]||''):'')}`;
 return `<article class="card"><img src="${A+x[0]}" alt="${x[1]} cover" loading="lazy"><h3>${x[1]}</h3><div class="price">${price}</div><a class="details" href="${detail}">Look Inside · Product details</a>${x[2]?`<a class="buy-link" href="${x[2]}" target="_blank" rel="noopener">BUY NOW</a>`:`<button data-placeholder>BUY NOW</button>`}</article>`
}).join('')}
render('english',sets.english,'Paperback $24.99');render('bonusgrid',sets.bonus,'$44.99');render('learninggrid',sets.learning,'$24.99');render('spanishgrid',sets.spanish,'From $24.99');render('colorgrid',sets.color,'$21.99');
document.addEventListener('click',e=>{if(e.target.matches('[data-placeholder]'))alert('This feature is ready for your real checkout, video, review, or product link before launch.')});

const modal=document.getElementById('productModal');
document.addEventListener('click',e=>{
 const d=e.target.closest('[data-product]');
 if(d){const c=d.closest('.card');document.getElementById('modalCover').src=c.querySelector('img').src;document.getElementById('modalTitle').textContent=c.querySelector('h3').textContent;document.getElementById('modalPrice').textContent=c.querySelector('.price').textContent;const live=c.querySelector('.buy-link');const mb=document.getElementById('modalBuy');if(live){mb.href=live.href;mb.textContent='BUY NOW';mb.target='_blank'}else{mb.removeAttribute('href');mb.textContent='CHECKOUT COMING SOON';mb.removeAttribute('target')}modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
 if(e.target.matches('.modalclose')||e.target===modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
});
