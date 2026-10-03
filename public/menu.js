// Compact header menu for small screens. Below 901px the header nav collapses
// behind a Menu button; above that it is the normal row of links.
(function(){
const header=document.querySelector('header'),btn=header&&header.querySelector('.menu-toggle'),nav=document.getElementById('site-nav');
if(!btn||!nav)return;
const isOpen=()=>header.classList.contains('menu-open');
function set(open){header.classList.toggle('menu-open',open);btn.setAttribute('aria-expanded',String(open))}
btn.addEventListener('click',()=>set(!isOpen()));
nav.addEventListener('click',e=>{if(e.target.closest('a'))set(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen()){set(false);btn.focus()}});
document.addEventListener('click',e=>{if(isOpen()&&!header.contains(e.target))set(false)});
const wide=matchMedia('(min-width:901px)');
const onWide=e=>{if(e.matches)set(false)};
wide.addEventListener?wide.addEventListener('change',onWide):wide.addListener(onWide);
})();
