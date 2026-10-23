// Squish Squad Shop — merchandise design previews (Coming Soon), plus live
// checkout for the Printful T-shirt, hoodie and mug once /api/merch says the
// shop is open ("preview" shows it only at ?shop=preview). Book checkout lives
// in app.js and is untouched.
(function(){
const M='assets/merch/';
// One image asset: base name, full-size and 720w dimensions (sw=0: one size).
const img=(name,w,h,sw,sh,alt)=>({name,w,h,sw,sh,alt});
// Combined collection sheets show white, pink and royal blue side by side in
// one image, so they get no color selector.
const sheet=(name,h,sh,alt)=>img(name,1400,h,720,sh,alt);
const TRIO='Shown in white, pink and royal blue';

const tee={
 white:img('squish-squad-tshirt-white',1400,726,720,374,'White Squish Squad T-shirt design: front view with Squish Man in his gold crown and blue cape beside Pudy under The Amazing Adventures of Squish Man banner, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 pink:img('squish-squad-tshirt-pink',1400,716,720,368,'Pink Squish Squad T-shirt design: front view with Squish Man and Pudy above The Amazing Adventures of Squish Man banner, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 blue:img('squish-squad-tshirt-blue',1400,697,720,359,'Royal-blue Squish Squad T-shirt design: front view with Squish Man and Pudy above The Amazing Adventures of Squish Man banner, a back view with a gold crown, SQUISHMAN wordmark and white paw print, and a close-up of the print')
};
const hoodie={
 white:img('squish-squad-hoodie-white',1400,728,720,375,'White Squish Squad hoodie design: front view with Squish Man and Pudy artwork above the front pocket, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 pink:img('squish-squad-hoodie-pink',1400,702,720,361,'Pink Squish Squad hoodie design: front view with Squish Man and Pudy artwork above the front pocket, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 royal:img('squish-squad-hoodie-royal-blue',1400,711,720,366,'Royal-blue Squish Squad hoodie design: front view with Squish Man and Pudy artwork above the front pocket, a close-up of the print, and a back view with a gold crown, SQUISHMAN wordmark and white paw print')
};
const sleeve={
 white:img('squish-squad-long-sleeve-white',1400,661,720,340,'White Squish Squad long-sleeve shirt design: front view with Squish Man and Pudy above The Amazing Adventures of Squish Man banner, a back view with a gold crown, SQUISHMAN wordmark and blue paw print, and a close-up of the print'),
 pink:img('squish-squad-long-sleeve-pink',1400,709,720,365,'Pink Squish Squad long-sleeve shirt design: front view with Squish Man and Pudy above The Amazing Adventures of Squish Man banner, a close-up of Squish Man, and a back view with a gold crown, SQUISHMAN wordmark and blue paw print'),
 royal:img('squish-squad-long-sleeve-royal-blue',1400,674,720,347,'Royal-blue Squish Squad long-sleeve shirt design: front view with Squish Man and Pudy above The Amazing Adventures of Squish Man banner, a back view with a gold crown, SQUISHMAN wordmark and white paw print, and a close-up of the print')
};
const pudy=img('pudy-plush-front-side-back',1146,602,720,378,'Pudy plush design shown from the front, side and back: a fluffy brown puppy with tan muzzle, chest and paws, floppy ears, a short stub tail and a royal-blue collar with a gold paw and the name PUDY');
const pudyDetail=img('pudy-plush-detail-views',492,342,0,0,'Close-up details of the Pudy plush design: embroidered brown eyes, the blue collar with an embroidered gold paw and PUDY name, and her short stub tail');
const squish=img('squish-man-plush-front-side-back',1146,602,720,378,'Squish Man plush design shown from the front, side and back: a fluffy cream Chihuahua with big ears, a gold crown and a royal-blue cape with gold stars and a gold paw medallion');
const squishDetail=img('squish-man-plush-detail-views',492,342,0,0,'Close-up details of the Squish Man plush design: the soft gold crown, the embroidered gold paw medallion and the royal-blue cape with gold stars');
const bundles=img('squish-man-gift-bundles',1400,558,720,287,'Squish Man gift set designs in three boxes: the Squish Squad Starter Pack with a Squish Man plush, book, bookmark and sticker sheet; the Bedtime Adventure Set with a Pudy plush, book, pink character blanket and bookmark; and the Back-to-School Set with a royal-blue backpack, lunch box and water bottle');

// colors: [label, swatch hex, image] — only colors with their own image asset.
// sheet:true marks a combined collection sheet shown as one full image.
// hidden:true keeps a design out of the shop until a fulfiller is confirmed:
// plush and gift sets need other suppliers; the rest are unconfirmed in Printful.
const one=(label,i)=>[[label,'',i]];
const categories=[
 {id:'merch-apparel',title:'Apparel',blurb:'Squish Man and Pudy, ready to wear.',items:[
  {name:'Squish Squad T-Shirt',desc:'Squish Man in his gold crown and royal-blue cape poses with best friend Pudy on the front, framed by stars, paw prints and The Amazing Adventures of Squish Man banner. The back keeps it simple with a gold crown, the SQUISHMAN wordmark and a paw print.',colors:[['White','#ffffff',tee.white],['Pink','#f59ac4',tee.pink],['Royal Blue','#1747d8',tee.blue]]},
  {name:'Squish Squad Kids’ T-Shirts',hidden:true,desc:'Kids’ tees.',colors:[]},
  {name:'Squish Squad Hoodie',desc:'The same bold, full-color Squish Man and Pudy artwork on a cozy pullover hoodie with a front pocket, plus the crown, wordmark and paw print across the back.',colors:[['White','#ffffff',hoodie.white],['Pink','#f59ac4',hoodie.pink],['Royal Blue','#1747d8',hoodie.royal]]},
  {name:'Squish Squad Kids’ Hoodies',hidden:true,desc:'Kids’ hoodies.',colors:[]},
  {name:'Squish Squad Long Sleeve',desc:'A long-sleeve take on the Squish Squad design: Squish Man and Pudy on the front, and the gold crown, SQUISHMAN wordmark and paw print on the back.',colors:[['White','#ffffff',sleeve.white],['Pink','#f59ac4',sleeve.pink],['Royal Blue','#1747d8',sleeve.royal]]},
  {name:'Squish Squad Kids’ Long Sleeves',hidden:true,desc:'Kids’ long sleeves.',colors:[]},
  {name:'Squish Squad Kids’ Leggings',hidden:true,desc:'Kids’ leggings.',colors:[]},
  {name:'Squish Squad Baby One-Pieces',hidden:true,desc:'Baby one-pieces.',colors:[]},
  {name:'Squish Squad Pajama Sets',hidden:true,desc:'Bedtime in Maple Hollow: a long-sleeve top with Squish Man and Pudy on the front and the crown and wordmark on the back, paired with pants covered in Squish Man and Pudy faces, gold crowns, stars and paw prints.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-pajama-sets',722,371,'Squish Man pajama sets in white, pink and royal blue: long-sleeve tops with Squish Man and Pudy on the front and a crown, SQUISHMAN wordmark and paw print on the back, with matching pants patterned with character faces, crowns, stars and paws'))}
 ]},
 {id:'merch-school',title:'School & Adventures',blurb:'Gear for the walk to Maple Hollow School and beyond.',items:[
  {name:'Squish Squad Backpacks',hidden:true,desc:'Squish Man and Pudy lead the way on the front, with a rainbow SQUISHMAN wordmark on the front pocket, navy straps and mesh side pockets.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-backpacks',798,410,'Squish Man backpacks in white, pink and royal blue with Squish Man and Pudy artwork, a rainbow SQUISHMAN wordmark on the front pocket, navy straps and mesh side pockets, shown from the front, back and side'))},
  {name:'Squish Squad Lunch Boxes',hidden:true,desc:'A zip-around lunch box with full-color Squish Man and Pudy artwork, navy trim and a carry handle. Open it up to find a silver lining inside.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-lunch-boxes',764,393,'Squish Man lunch boxes in white, pink and royal blue with Squish Man and Pudy artwork and navy trim, shown from the front, back and open with a silver lining'))},
  {name:'Squish Squad Water Bottles',desc:'Squish Man and Pudy wrap around the front, with the crown, wordmark and “Big Heart. Tiny Hero. Endless Adventures!” on the back. Topped with a navy flip-straw lid and carry loop.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-water-bottles',771,397,'Squish Man water bottles in white, pink and royal blue with Squish Man and Pudy artwork on the front, the crown, wordmark and slogan on the back, and a navy flip-straw lid'))},
  {name:'Squish Squad Hats',desc:'A classic cap with Squish Man, Pudy and the SQUISHMAN wordmark on the front, a crown-and-paw patch on the side and “Big Heart. Tiny Hero.” across the back.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-hats',764,393,'Squish Man baseball caps in white, pink and royal blue with Squish Man, Pudy and the SQUISHMAN wordmark on the front, a crown and paw patch on the side and Big Heart. Tiny Hero. on the back'))},
  {name:'Squish Squad Socks',hidden:true,desc:'Socks.',colors:[]},
  {name:'Squish Squad Drawstring Bags',hidden:true,desc:'Drawstring bags.',colors:[]},
  {name:'Squish Squad Notebooks',hidden:true,desc:'Notebooks.',colors:[]},
  {name:'Squish Squad Full-Color Caps',hidden:true,desc:'Full-color caps.',colors:[]},
  {name:'Squish Squad Beanies',hidden:true,desc:'Beanies.',colors:[]},
  {name:'Squish Squad Tote Bags',desc:'Roomy totes with navy handles and base, showing Squish Man and Pudy with the series banner on the front and the crown, wordmark and paw print on the back.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-tote-bags',777,400,'Squish Man tote bags in white, pink and royal blue with navy handles and base, Squish Man and Pudy artwork on the front and the crown, wordmark and paw print on the back'))}
 ]},
 {id:'merch-cozy',title:'Cozy Collection',blurb:'Soft and snuggly for storytime and bedtime.',items:[
  {name:'Pudy Plush',hidden:true,desc:'Squish Man’s bigger best friend as a huggable plush: fluffy brown fur, a tan muzzle and paws, floppy ears and her royal-blue collar with a gold paw and the name PUDY. Even her short stub tail made it in.',colors:[['Brown with blue collar','#6b3a1e',pudy]],extra:[pudyDetail]},
  {name:'Squish Man Plush',hidden:true,desc:'The brave little hero himself: a fluffy cream Chihuahua plush with his gold crown, royal-blue cape covered in gold stars and a gold paw medallion.',colors:[['Cream with royal-blue cape','#f3e6cf',squish]],extra:[squishDetail]},
  {name:'Squish Squad Blankets',desc:'A cuddly blanket with Squish Man and Pudy in the middle, a border of stars and paw prints, “Big Heart. Tiny Hero. Endless Adventures!” below, and a soft cream reverse side.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-blankets',765,393,'Squish Man blankets in white, pink and royal blue with Squish Man and Pudy artwork, star and paw borders and the series slogan, shown with the cream reverse side and folded'))},
  {name:'Squish Squad Pillows',desc:'Square pillows with Squish Man and Pudy on the front, piped edges, and the crown, SQUISHMAN wordmark and paw print on the back.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-pillows',763,392,'Squish Man pillows in white, pink and royal blue with Squish Man and Pudy artwork on the front, piped edges and the crown, wordmark and paw print on the back'))},
  {name:'Squish Squad Color Pillows',hidden:true,desc:'Square color pillows.',colors:[]},
  {name:'Storybook Lumbar Pillows',hidden:true,desc:'Storybook lumbar pillows.',colors:[]}
 ]},
 {id:'merch-gifts',title:'Gifts & Activities',blurb:'Creative extras for every young adventurer.',items:[
  {key:'bundles',name:'Squish Man Gift Sets',hidden:true,desc:'Three gift-box designs in one collection. The Squish Squad Starter Pack pairs a Squish Man plush with a book, bookmark and sticker sheet. The Bedtime Adventure Set brings a Pudy plush, a pink Squish Man and Pudy blanket, a book and a bookmark. The Back-to-School Set packs a royal-blue character backpack, lunch box and water bottle.',sheet:true,wide:true,shown:'Full design sheet shown',colors:one('Collection',bundles)},
  {name:'Squish Squad Bookmarks',hidden:true,desc:'Squish Man and Pudy on the front; on the back, a crown, paw print and the reminder “Every page is an adventure! Keep reading. Keep dreaming. Keep being kind.”',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-bookmarks',776,399,'Squish Man bookmarks in white, pink and royal blue: Squish Man and Pudy on the front and Every page is an adventure! Keep reading. Keep dreaming. Keep being kind. on the back'))},
  {name:'Squish Squad Sticker Packs',desc:'A sheet of Squish Man, Pudy, crown, paw print and “Squish Squad” stickers, ready to peel and share.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-sticker-packs',793,408,'Squish Man sticker sheets in white, pink and royal blue with Squish Man, Pudy, crown, paw print and Squish Squad stickers, shown with the packaging and a peeling paw sticker'))},
  {name:'Maple Hollow Posters',desc:'Squish Man and Pudy in a flower-filled Maple Hollow square with a fountain and cozy cottages, under the series title and the message “Choose kindness. Be brave. Believe in yourself.”',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-posters',797,410,'Squish Man posters in white, pink and royal blue showing Squish Man and Pudy in Maple Hollow by a fountain, with the slogan and Choose kindness. Be brave. Believe in yourself., plus a framed room view and print close-up'))},
  {name:'Character Pin Sets',hidden:true,desc:'A set of gold-edged pins: Squish Man, Pudy, the SQUISHMAN wordmark, a crown and a paw print, presented on a character card.',sheet:true,shown:'Shown with white, pink and royal-blue packaging',colors:one('Collection',sheet('squish-squad-character-pins',775,398,'Squish Man character pin sets with Squish Man, Pudy, wordmark, crown and paw pins on white, pink and royal-blue cards, plus pin front and back close-ups'))},
  {name:'Squish Squad Mugs',desc:'A mug with Squish Man and Pudy on the front, a navy handle and inside, and the crown, wordmark and “Big Heart. Tiny Hero. Endless Adventures!” on the back.',sheet:true,shown:TRIO,colors:one('Collection',sheet('squish-squad-mugs',766,394,'Squish Man mugs in white, pink and royal blue with Squish Man and Pudy on the front, a navy handle and inside, and the crown, wordmark and slogan on the back'))},
  {name:'Maple Hollow Adventure Puzzles',hidden:true,desc:'A jigsaw puzzle of Squish Man and Pudy in the Maple Hollow square, packed in a matching picture box.',sheet:true,shown:'Shown with white, pink and royal-blue packaging',colors:one('Collection',sheet('maple-hollow-puzzles',776,399,'Maple Hollow Adventure Puzzle boxes in white, pink and royal blue showing Squish Man and Pudy in the town square, with a close-up of the puzzle pieces'))}
 ]}
];

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const srcset=i=>i.sw?`${M}${i.name}-720.webp 720w, ${M}${i.name}.webp ${i.w}w`:`${M}${i.name}.webp ${i.w}w`;
const small=i=>i.sw?[`${M}${i.name}-720.webp`,i.sw,i.sh]:[`${M}${i.name}.webp`,i.w,i.h];
const products=[];

// Printful products sold on the site: card name → product key and the real
// product photos (front and back of each color, from Printful's mockups).
// Not every color comes in every size, so the size list follows the color.
const SHOP={
 'Squish Squad T-Shirt':{key:'TEE',img:'tee',facts:'Unisex S–3XL · soft cotton tee'},
 'Squish Squad Kids’ Hoodies':{key:'KIDSHOODIE',img:'kidshoodie',name:'Squish Squad Kids’ Hoodie',facts:'Youth 8–20 · soft brushed fleece inside',
  desc:'A cozy kids’ hoodie in nine bright colors, with the color printed all over and your favorite Squish Man design on the front. Soft brushed fleece inside and a double-layer hood.'},
 'Squish Squad Kids’ Long Sleeves':{key:'KIDSLONGSLEEVE',img:'kidslongsleeve',name:'Squish Squad Kids’ Long Sleeve',facts:'Youth S–L · soft cotton jersey',
  desc:'The Squish Squad long sleeve in kids’ sizes, with the same five designs as the kids’ tee on a soft Bella + Canvas youth jersey.'},
 'Squish Squad Baby One-Pieces':{key:'BABY',img:'baby',name:'Squish Squad Baby One-Piece',facts:'3–18 months · soft ring-spun cotton · snap closure',
  desc:'A soft cotton one-piece for the littlest Squish Squad fans, in the same five designs as the kids’ tee. Envelope neckline and three snaps at the bottom for easy changes.'},
 'Squish Squad Kids’ T-Shirts':{key:'KIDSTEE',img:'kidstee',name:'Squish Squad Kids’ T-Shirt',facts:'Youth S–XL · soft cotton tee',
  desc:'The Squish Squad tee in kids’ sizes: the same five designs as the grown-up shirt in bright, kid-friendly colors, on a soft Bella + Canvas youth tee.'},
 'Squish Squad Hoodie':{key:'HOODIE',img:'hoodie',facts:'Unisex S–3XL · cotton-blend fleece'},
 'Squish Squad Long Sleeve':{key:'LONGSLEEVE',img:'longsleeve',facts:'Unisex S–3XL (pink to 2XL) · cotton'},
 'Squish Squad Tote Bags':{key:'TOTE',img:'tote',name:'Squish Squad Tote Bag',facts:'Organic cotton canvas · roomy everyday size',
  desc:'A sturdy organic cotton tote for books, library days and adventures, in black or natural canvas with your choice of Squish Man design.'},
 'Squish Squad Sticker Packs':{key:'STICKER',img:'sticker',name:'Squish Squad Sticker',facts:'Glossy kiss-cut vinyl · 3, 4 or 5.5 inches',shown:'Glossy sticker, cut to the shape of the art',
  desc:'A glossy vinyl sticker cut around the artwork, for water bottles, notebooks and laptops. Pick your favorite: Squish Man, Pudy and friends in Maple Hollow, the logos and more.'},
 'Maple Hollow Posters':{key:'POSTER',img:'poster',name:'Squish Squad Poster',facts:'Enhanced matte paper · 8×10 or 10×10 inches',shown:'Matte poster, art centered on white',
  desc:'A museum-quality matte poster for bedrooms, classrooms and reading nooks, with your favorite Squish Man art centered on crisp white paper. Frame not included.'},
 'Maple Hollow Adventure Puzzles':{key:'PUZZLE',img:'puzzle',name:'Maple Hollow Puzzle',facts:'In a gift tin · 30 or 110 pieces (10×8″), 252 pieces (14×11″)',shown:'Assembled puzzle shown · ships in a gift tin',
  desc:'A jigsaw puzzle of a full-page scene from the Squish Man books, packed in a keepsake tin. Start small with 30 pieces or work up to 252.'},
 'Squish Squad Water Bottles':{key:'BOTTLE',img:'bottle',name:'Squish Squad Water Bottle',facts:'17 oz stainless steel · white or black',
  desc:'A 17 oz stainless steel bottle with a screw-on steel lid, in white or black with your favorite Squish Man art on the front. Hand wash only.'},
 'Squish Squad Pillows':{key:'PILLOW',img:'pillow',name:'Squish Squad Shaped Pillow',facts:'Soft polyester · 10 or 16 inches · cut to the shape of the art',shown:'Pillow cut to the shape of the art · white back',
  desc:'A soft, huggable pillow cut to the shape of your favorite Squish Man art, printed on the front with a plain white back. Perfect for beds, reading nooks and car rides.'},
 'Squish Squad Color Pillows':{key:'COLORPILLOW',img:'colorpillow',name:'Squish Squad Color Pillow',facts:'Soft polyester case and insert · 16 or 18 inches',shown:'Front and back, same color',
  desc:'A soft square pillow with your favorite Squish Man art centered on a bold color, the same color on the back. Hidden zipper and a machine-washable case.'},
 'Storybook Lumbar Pillows':{key:'LUMBAR',img:'lumbar',name:'Storybook Lumbar Pillow',facts:'20×12 inches · soft polyester case and insert',shown:'Front and back, same scene',
  desc:'A long pillow covered edge to edge with a scene from the Squish Man books, printed on both sides. Perfect across a bed or in a reading nook. Hidden zipper and a machine-washable case.'},
 'Squish Squad Beanies':{key:'BEANIE',img:'beanie',name:'Squish Squad Beanie',facts:'One size fits most · soft acrylic knit · embroidered',shown:'Embroidered on the cuff',
  desc:'A snug, cozy cuffed beanie with the gold crown SQUISHMAN logo, The Amazing Adventures of Squish Man – Maple Hollow logo or a paw print embroidered on the cuff. Soft, stretchy knit that fits kids and grown-ups.'},
 'Squish Squad Hats':{key:'HAT',img:'hat',name:'Squish Squad Youth Cap',facts:'Kids’ size · adjustable strap · embroidered',shown:'Front and back',
  desc:'A kids’ baseball cap with your favorite Squish Man picture embroidered on the front and the gold crown SQUISHMAN logo on the back, with a curved brim and an adjustable strap.'},
 'Squish Squad Full-Color Caps':{key:'DADHAT',img:'dadhat',name:'Squish Squad Full-Color Cap',facts:'Adult size · adjustable strap · full-color print',shown:'Printed in full color on the front',
  desc:'A soft, low-profile cotton cap with your favorite Squish Man picture printed in full color on the front and an adjustable strap. Sized for grown-ups.'},
 'Squish Squad Blankets':{key:'BLANKET',img:'blanket',name:'Squish Squad Sherpa Blanket',facts:'Smooth printed front · fluffy sherpa back · 3 sizes',shown:'50×60″ shown · border of stars and paw prints',
  desc:'A cozy sherpa blanket with your favorite Squish Man art on a bright color, framed by gold stars and paw prints, with soft, fluffy sherpa on the back. Kid size 37×57″, throw 50×60″, or big 60×80″.'},
 'Squish Squad Socks':{key:'SOCKS',img:'socks',name:'Squish Squad Socks',facts:'Crew socks · S (women 6–8, men 5–6.5, big kids), M, L',shown:'Outside and back of the sock',
  desc:'Soft, stretchy crew socks covered in gold stars and paw prints, with Squish Man under the cuff and a cushioned sole. Size S fits big kids and smaller grown-ups.'},
 'Squish Squad Drawstring Bags':{key:'DRAWSTRING',img:'drawstring',name:'Squish Squad Drawstring Bag',facts:'15×17″ · 100% polyester · cotton straps',shown:'Same design on both sides',
  desc:'A light drawstring backpack for gym class, swim lessons and sleepovers, with The Amazing Adventures of Squish Man banner, the gold crown and a gold SQUISHMAN, and gold stars and paw prints, on both sides.'},
 'Squish Squad Notebooks':{key:'NOTEBOOK',img:'notebook',name:'Squish Squad Notebook',facts:'5.5×8.5″ · 140 dotted pages · metal spiral',shown:'Front and back covers',
  desc:'A spiral notebook for doodles, stories and schoolwork, with The Amazing Adventures of Squish Man banner, the gold crown and SQUISHMAN on the front, and the crown and SQUISHMAN on the back. Soft-touch covers, 140 dotted pages.'},
 'Squish Squad Kids’ Leggings':{key:'LEGGINGS',img:'leggings',name:'Squish Squad Kids’ Leggings',facts:'Kids 2T–7 · youth 8–20 · soft stretch microfiber',shown:'Front and side',
  desc:'Soft, stretchy leggings covered in gold stars and paw prints, with a little gold crown on each hip and an elastic waistband. Bright colors that won’t fade in the wash.'},
 'Squish Squad Backpacks':{key:'BACKPACK',img:'backpack',name:'Squish Squad Backpack',facts:'16×12×4″ · water-resistant · laptop pocket',shown:'Front of the backpack',
  desc:'A roomy, water-resistant backpack with The Amazing Adventures of Squish Man banner on the front, a gold crown and gold SQUISHMAN on the front pocket, and gold stars and paw prints all around. Inside laptop sleeve. Great for school and adventures.'},
 'Squish Squad Mugs':{key:'MUG',img:'mug',name:'Squish Squad Mug',facts:'11 oz ceramic · dishwasher and microwave safe',
  desc:'A white glossy mug with Squish Man and Pudy on one side and the gold crown, SQUISHMAN wordmark and paw print on the other.'}
};
const slug=s=>s.toLowerCase().replace(/\s+/g,'-');
const money=c=>'$'+(c/100).toFixed(2);
// Every shop product comes in five designs: the full design (FULL: Squish Man
// & Pudy front, crown logo back), Squish Man & Pudy alone (PUDY), the crown
// logo alone (LOGO), the Maple Hollow logo alone (MAPLE) or the Maple Hollow
// logo front with the crown logo back (MAPLECROWN), each with its own price
// and photos.
const design=p=>p.shop.designs[p.design||0];
const unit=(p,size)=>design(p).priceCents+(p.shop.sizeUpchargeCents[size]||0);
const DESIGN_NOTE='Every shirt, long sleeve and hoodie (grown-up and kids’), baby one-piece, tote bag and mug comes in five designs: Squish Man & Pudy on the front with the crown logo on the back, Squish Man & Pudy on their own, the gold crown SQUISHMAN logo for a simpler look, The Amazing Adventures of Squish Man – Maple Hollow logo, or the Maple Hollow logo on the front with the crown logo on the back. Stickers come in eleven designs, from Royal Squish Man to Squish Man\'s values signpost, posters in eight, water bottles, shaped pillows, color pillows and sherpa blankets in six each, and jigsaw puzzles and lumbar pillows in six storybook scenes. Caps come embroidered for kids, with the SQUISHMAN logo on the back, or printed in full color for grown-ups.';
const MAX_DESIGN_BUTTONS=6;
const DESIGN_TITLE={FULL:'Squish Man & Pudy + Crown',PUDY:'Squish Man & Pudy',LOGO:'Crown Logo',MAPLE:'Maple Hollow Logo',MAPLECROWN:'Maple Hollow + Crown',
 MH_PALS:'Maple Hollow Pals',MH_HIGHFIVE:'Maple Hollow High Five',MH_WAVE:'Maple Hollow Wave',MH_SQUARE:'Maple Hollow Town Square',
 SM_VALUES:'Squish Man Values',SM_ROYAL:'Royal Squish Man',MH_SIGN:'Maple Hollow Sign',BEST_FRIENDS:'Best Friends',
 PZ_WELCOME:'Welcome to Maple Hollow',PZ_ROYAL_HERO:'The Little Royal Hero',PZ_PAW_PRINTS:'Follow the Paw Prints',PZ_GARDEN_GATE:'The Secret Garden Gate',PZ_GOODNIGHT:'Goodnight, Squish Man',PZ_MOONLIGHT:'Moonlight Over Maple Hollow',
 HAT_CROWN:'Crown',HAT_PAW:'Paw Print',SOCK_PATTERN:'Stars & Paw Prints'};
// Designs that print on both sides (front + back, or both sides of the mug).
const TWO_SIDED=new Set(['FULL','MAPLECROWN']);
const DESIGN_ART={PUDY:'Squish Man and Pudy',LOGO:'the crown logo',MAPLE:'the Squish Man Maple Hollow logo',
 MH_PALS:'Squish Man and Pudy in Maple Hollow',MH_HIGHFIVE:'Squish Man and Pudy giving a high five',MH_WAVE:'Squish Man and Pudy waving',MH_SQUARE:'Squish Man and Pudy in the Maple Hollow town square',
 SM_VALUES:'Squish Man and Pudy by a signpost of values: kindness, courage, creativity, persistence, confidence, communication, responsibility, self-control and teamwork',
 SM_ROYAL:'Squish Man in his crown and royal-blue cape',MH_SIGN:'Squish Man and Pudy above a Maple Hollow sign',BEST_FRIENDS:'Squish Man and Pudy cuddled up as best friends',
 PZ_WELCOME:'Squish Man strolling down a sunny Maple Hollow street',PZ_ROYAL_HERO:'Squish Man in his crown and cape, running toward you',PZ_PAW_PRINTS:'Squish Man following paw prints along a garden path',
 PZ_GARDEN_GATE:'Squish Man peeking through an old garden gate',PZ_GOODNIGHT:'Squish Man curled up in his royal-blue bed',PZ_MOONLIGHT:'Squish Man asleep in a cottage window under a full moon',
 HAT_CROWN:'the gold crown',HAT_PAW:'a blue paw print',SOCK_PATTERN:'gold stars and paw prints all over'};
function shopColors(p){
 const k=design(p).key,suffix={FULL:'',PUDY:'-pudy',LOGO:'-logo',MAPLE:'-maple',MAPLECROWN:'-maplecrown',MH_PALS:'-pals',MH_HIGHFIVE:'-highfive',MH_WAVE:'-wave',MH_SQUARE:'-square',SM_VALUES:'-values',SM_ROYAL:'-royal',MH_SIGN:'-sign',BEST_FRIENDS:'-bestfriends',PZ_WELCOME:'-welcome',PZ_ROYAL_HERO:'-royalhero',PZ_PAW_PRINTS:'-pawprints',PZ_GARDEN_GATE:'-gardengate',PZ_GOODNIGHT:'-goodnight',PZ_MOONLIGHT:'-moonlight',HAT_CROWN:'-crown',HAT_PAW:'-paw',SOCK_PATTERN:'-pattern'}[k];
 const alt=c=>k==='FULL'?`${p.name} in ${c}: front and back, as printed by our print partner`
  :k==='MAPLECROWN'?`${p.name} in ${c}: the Maple Hollow logo on the front and the crown logo on the back`
  :p.shop.key==='HAT'?`${p.name} in ${c} with ${DESIGN_ART[k]} embroidered on the front and ${k==='LOGO'?'a paw print':'the crown SQUISHMAN logo'} on the back`
  :p.shop.key==='BEANIE'?`${p.name} in ${c} with ${DESIGN_ART[k]} embroidered on the cuff, and a close-up`
  :p.shop.key==='DADHAT'?`${p.name} in ${c} with ${DESIGN_ART[k]} printed in full color on the front, and a close-up`
  :p.shop.key==='PUZZLE'||p.shop.key==='LUMBAR'?`${p.name} showing ${DESIGN_ART[k]}, and a close-up of the picture`
  :p.shop.key==='POSTER'?`${p.name} with ${DESIGN_ART[k]} centered on white paper, and a close-up of the artwork`
  :`${p.name} in ${c} with ${DESIGN_ART[k]} on the front, and a close-up of the artwork`;
 return p.shop.colors.map(c=>[c.name,c.hex,img(`shop-${p.imgBase}-${slug(c.name)}${suffix}`,1400,700,720,360,alt(c.name.toLowerCase()))]);
}

function card(p){
 const n=products.push(p)-1;
 return cardHtml(p,n);
}
function cardHtml(p,n){
 const [first]=p.colors,[src,w,h]=small(first[2]),m=p.shop;
 const multi=p.colors.length>1;
 const swatches=multi?`<div class="merch-colors" role="group" aria-label="${esc(p.name)} color">${p.colors.map((c,i)=>`<button type="button" class="merch-swatch" data-merch="${n}" data-color="${i}" aria-pressed="${i===0}" style="--sw:${c[1]}"><span class="merch-dot" aria-hidden="true"></span>${esc(c[0])}</button>`).join('')}</div>`:'';
 const shown=p.shown||`Shown in ${esc(first[0].toLowerCase())}`;
 return `<article class="merch-card${p.wide?' merch-card-wide':''}" id="merch-item-${n}">
 <div class="merch-art"><img src="${src}" srcset="${srcset(first[2])}" sizes="(max-width:700px) 92vw, ${p.wide?'1100px':'560px'}" width="${w}" height="${h}" alt="${esc(first[2].alt)}" loading="lazy" decoding="async"></div>
 <div class="merch-body"><span class="merch-badge">${m?'NOW AVAILABLE':'COMING SOON'}</span><h4>${esc(p.name)}</h4><p>${esc(p.desc)}</p>
 ${swatches}<p class="merch-shown" aria-live="polite">${esc(shown)}</p>
 ${m?buyHtml(p,n):`<dl class="merch-facts"><div><dt>Price</dt><dd>To be announced</dd></div><div><dt>Sizes &amp; materials</dt><dd>To be announced</dd></div></dl>
 <div class="merch-actions"><button type="button" class="merch-explore" data-gallery="${n}" aria-label="Explore the design: ${esc(p.name)}">EXPLORE THE DESIGN</button><button type="button" class="merch-checkout" disabled aria-label="Checkout coming soon: ${esc(p.name)}">CHECKOUT COMING SOON</button></div>`}</div>
</article>`;
}
const opts=(a,f)=>a.map(v=>`<option value="${esc(v)}">${esc(f(v))}</option>`).join('');
const sizeLabel=(m,v)=>m.sizeUpchargeCents[v]?`${v} (+${money(m.sizeUpchargeCents[v])})`:v;
const colorSizes=p=>p.shop.colors[p.active||0].sizes;
const where=(m,d)=>m.key==='HAT'?'front + back':m.key==='DADHAT'?'front':['STICKER','POSTER','PUZZLE','BOTTLE','PILLOW','COLORPILLOW','LUMBAR','BLANKET','SOCKS','BACKPACK','DRAWSTRING','NOTEBOOK','LEGGINGS','BEANIE'].includes(m.key)?'':TWO_SIDED.has(d.key)?(m.key==='MUG'?'both sides':'front + back'):(m.key==='MUG'?'one side':'front only');
function buyHtml(p,n){
 const m=p.shop,size=colorSizes(p)[0],one=m.sizes.length===1;
 return `${m.designs.length>1?`<p class="merch-design-note">${m.designs.length} designs to choose from</p>`:''}${m.designs.length>MAX_DESIGN_BUTTONS?`<label class="merch-design-list">Design <select class="merch-design-select" data-merch="${n}">${m.designs.map((d,i)=>`<option value="${i}"${i===(p.design||0)?' selected':''}>${esc(DESIGN_TITLE[d.key]||d.label)}</option>`).join('')}</select></label>`:''}<div class="merch-designs"${m.designs.length>MAX_DESIGN_BUTTONS||m.designs.length===1?' hidden':''} role="group" aria-label="${esc(p.name)} design">${m.designs.map((d,i)=>`<button type="button" class="merch-design" data-merch="${n}" data-design="${i}" aria-pressed="${i===(p.design||0)}"><b>${esc(DESIGN_TITLE[d.key]||d.label)}</b><span>${where(m,d)?`${esc(where(m,d))} · `:''}${['STICKER','POSTER','PUZZLE','PILLOW','COLORPILLOW','BLANKET'].includes(m.key)?'from ':''}${money(d.priceCents)}</span></button>`).join('')}</div>
 <dl class="merch-facts"><div><dt>Price</dt><dd class="merch-price">${money(unit(p,size))}</dd></div><div><dt>Sizes &amp; materials</dt><dd>${esc(p.facts)}</dd></div></dl>
 <div class="merch-buy">${one?'':`<label>Size <select class="merch-size" data-merch="${n}">${opts(colorSizes(p),v=>sizeLabel(m,v))}</select></label>`}<label>Quantity <select class="merch-qty" data-merch="${n}">${opts(Array.from({length:m.maxQuantity},(_,i)=>String(i+1)),v=>v)}</select></label></div>
 <p class="merch-ship">Shipping ${money(m.shipping.firstCents)}${m.shipping.additionalCents?`, plus ${money(m.shipping.additionalCents)} for each extra item`:''} · US only · printed to order, ships in about 1–2 weeks</p>
 <div class="merch-actions"><button type="button" class="merch-explore" data-gallery="${n}" aria-label="See photos: ${esc(p.name)}">SEE PHOTOS</button><button type="button" class="merch-buy-now" data-buy="${n}" aria-label="Buy now: ${esc(p.name)}">BUY NOW</button></div>
 <p class="merch-error" role="alert" hidden></p>`;
}
const root=document.getElementById('merchCategories');
if(!root)return;
root.innerHTML=categories.map(c=>`<section class="merch-cat" id="${c.id}" aria-labelledby="${c.id}-h"><div class="merch-cat-head"><h3 id="${c.id}-h">${esc(c.title)}</h3><p>${esc(c.blurb)}</p></div><div class="merch-grid">${c.items.filter(p=>!p.hidden).map(card).join('')}</div></section>`).join('');

// Open the shop for the Printful products when /api/merch says so: real
// colors and photos, size, quantity and a Stripe checkout button.
const params=new URLSearchParams(location.search);
if(params.get('shop')==='thanks'){
 const t=document.createElement('div');t.className='merch-thanks';t.setAttribute('role','status');
 t.innerHTML='<b>Thank you! Your Squish Squad order is confirmed.</b><span>It is printed just for you and usually ships within 1–2 weeks. Questions? Email <a href="mailto:orders@squishman.com">orders@squishman.com</a>.</span>';
 root.before(t);
}
fetch('/api/merch',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
 if(!data||!(data.checkout==='on'||(data.checkout==='preview'&&params.get('shop')==='preview')))return;
 // Hidden cards the shop now sells (puzzles) join their category.
 categories.forEach(c=>c.items.forEach(p=>{
  const s=SHOP[p.name];
  if(!p.hidden||!s||!data.products.some(x=>x.key===s.key))return;
  const n=products.push(p)-1,grid=document.querySelector(`#${c.id} .merch-grid`);
  if(grid)grid.insertAdjacentHTML('beforeend',`<article id="merch-item-${n}"></article>`);
 }));
 products.forEach((p,n)=>{
  const s=SHOP[p.name],m=s&&data.products.find(x=>x.key===s.key);if(!m)return;
  Object.assign(p,{shop:m,sheet:false,shown:s.shown||null,active:0,design:0,imgBase:s.img,facts:s.facts,name:s.name||p.name,desc:s.desc||p.desc});
  p.colors=shopColors(p);
  const el=document.getElementById('merch-item-'+n);if(el)el.outerHTML=cardHtml(p,n);
 });
 const news=document.createElement('div');news.className='merch-news';news.setAttribute('role','note');
 news.innerHTML=`<b>Now open: the Squish Squad Shop!</b><span>${esc(DESIGN_NOTE)}</span>`;
 root.before(news);
}).catch(()=>{});

// Design picker: swap photos and price, keep the chosen color and size.
// Products with many designs (stickers) use a dropdown instead of buttons.
function pickDesign(p,cardEl,i){
 p.design=i;p.colors=shopColors(p);
 cardEl.querySelectorAll('.merch-design').forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.design===i)));
 const c=p.colors[p.active||0][2],im=cardEl.querySelector('.merch-art img'),[src,w,h]=small(c);
 im.src=src;im.srcset=srcset(c);im.width=w;im.height=h;im.alt=c.alt;
 const sizeSel=cardEl.querySelector('.merch-size');
 cardEl.querySelector('.merch-price').textContent=money(unit(p,sizeSel?sizeSel.value:p.shop.sizes[0]));
}
root.addEventListener('click',e=>{
 const b=e.target.closest('.merch-design');if(!b)return;
 pickDesign(products[+b.dataset.merch],b.closest('.merch-card'),+b.dataset.design);
});
root.addEventListener('change',e=>{
 const d=e.target.closest('.merch-design-select');if(!d)return;
 pickDesign(products[+d.dataset.merch],d.closest('.merch-card'),+d.value);
});

root.addEventListener('change',e=>{
 const sel=e.target.closest('.merch-size');if(!sel)return;
 const p=products[+sel.dataset.merch];
 sel.closest('.merch-card').querySelector('.merch-price').textContent=money(unit(p,sel.value));
});

root.addEventListener('click',async e=>{
 const b=e.target.closest('[data-buy]');if(!b)return;
 const p=products[+b.dataset.buy],cardEl=b.closest('.merch-card'),err=cardEl.querySelector('.merch-error');
 const size=cardEl.querySelector('.merch-size')?.value||p.shop.sizes[0];
 const quantity=+cardEl.querySelector('.merch-qty').value;
 err.hidden=true;b.disabled=true;b.textContent='ONE MOMENT…';
 try{
  const r=await fetch('/api/merch/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product:p.shop.key,design:design(p).key,color:p.colors[p.active||0][0],size,quantity})});
  const j=await r.json().catch(()=>({}));
  if(r.ok&&j.url){location.href=j.url;return}
  throw new Error(j.error||'Checkout is unavailable right now. Please try again.');
 }catch(x){
  err.textContent=x.message;err.hidden=false;b.disabled=false;b.textContent='BUY NOW';
 }
});

// Color selector: only products with a separate image per color get swatches.
root.addEventListener('click',e=>{
 const b=e.target.closest('.merch-swatch');if(!b)return;
 const p=products[+b.dataset.merch],c=p.colors[+b.dataset.color],cardEl=b.closest('.merch-card'),im=cardEl.querySelector('.merch-art img'),[src,w,h]=small(c[2]);
 im.src=src;im.srcset=srcset(c[2]);im.width=w;im.height=h;im.alt=c[2].alt;
 cardEl.querySelectorAll('.merch-swatch').forEach(s=>s.setAttribute('aria-pressed',String(s===b)));
 cardEl.querySelector('.merch-shown').textContent='Shown in '+c[0].toLowerCase();
 p.active=+b.dataset.color;
 const sizeSel=p.shop&&cardEl.querySelector('.merch-size');
 if(sizeSel){ // keep the chosen size if this color has it
  const keep=sizeSel.value,sizes=colorSizes(p);
  sizeSel.innerHTML=opts(sizes,v=>sizeLabel(p.shop,v));
  sizeSel.value=sizes.includes(keep)?keep:sizes[0];
  cardEl.querySelector('.merch-price').textContent=money(unit(p,sizeSel.value));
 }
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
 slides=ordered.map(c=>({img:c[2],label:p.sheet?`${p.name} — full collection`:`${p.name} — ${c[0]}`})).concat((p.extra||[]).map(x=>({img:x,label:`${p.name} — detail views`})));
 opener=from;gTitle.textContent=p.name;show(0);
 if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
 dlg.querySelector('.mg-close').focus();
}
document.addEventListener('click',e=>{
 const g=e.target.closest('[data-gallery]');if(!g)return;
 const p=products[+g.dataset.gallery];
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
