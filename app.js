const PRODUCTS = {
  sofa: { name: 'Glam Velvet Sofa', cat: 'Furniture · Sofa', price: 'Rs 149,000',
    desc: 'Curved velvet sofa with slim metal legs, about 2.2 m wide. Open it in your room to check the size against your wall.',
    glb: 'models/GlamVelvetSofa.glb', img: 'img/sofa.webp', ar: true },
  chair: { name: 'Sheen Lounge Chair', cat: 'Furniture · Chair', price: 'Rs 38,500',
    desc: 'Fabric lounge chair with a wooden frame. Switch colours below, then place it life-size next to your sofa.',
    glb: 'models/SheenChair.glb', img: 'img/chair.webp', ar: true },
  sunglasses: { name: 'Iridescent Sunglasses', cat: 'Accessories · Sunglasses', price: 'Rs 4,999',
    desc: 'Aviator-style frames with colour-shifting lenses. Rotate them in 3D, or try them on with your front camera.',
    glb: 'models/SunglassesKhronos.glb', img: 'img/sunglasses.webp', ar: true, tryon: true },
  shoe: { name: 'Everyday Sneaker', cat: 'Footwear · Sneaker', price: 'Rs 7,499',
    desc: 'Casual sneaker in three colourways. Spin it around to see the sole and stitching.',
    glb: 'models/MaterialsVariantsShoe.glb', img: 'img/shoe.webp', ar: true },
};

const $ = id => document.getElementById(id);
const mv = $('mv');
const params = new URLSearchParams(location.search);
let key = PRODUCTS[params.get('p')] ? params.get('p') : 'sofa';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function tabs() {
  $('tabs').innerHTML = Object.entries(PRODUCTS).map(([k, p]) =>
    `<a href="?p=${k}" data-k="${k}" class="${k === key ? 'on' : ''}">${p.name.split(' ').slice(-1)[0]}</a>`).join('');
  $('tabs').querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); load(a.dataset.k, true); });
}

function show(view) {
  const is3d = view === '3d';
  $('photo').hidden = is3d; mv.hidden = !is3d; $('hint').hidden = !is3d;
  document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('active', t.dataset.view === view));
}

function load(k, push) {
  key = k; const p = PRODUCTS[k];
  if (push) history.replaceState(null, '', '?p=' + k);
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === k));
  $('name').textContent = p.name; $('cat').textContent = p.cat; $('price').textContent = p.price; $('desc').textContent = p.desc;
  $('photo').src = p.img; $('photo').alt = p.name; $('thumbPhoto').src = p.img;
  mv.poster = p.img; mv.src = p.glb; mv.alt = '3D model of ' + p.name;
  $('variantBox').hidden = true;
  $('tryBtn').hidden = !p.tryon;
  qr();
  show('3d');
}

mv.addEventListener('progress', e => { $('bar').style.width = (e.detail.totalProgress * 100) + '%';
  $('bar').parentElement.style.opacity = e.detail.totalProgress >= 1 ? 0 : 1; });
mv.addEventListener('load', () => {
  const v = mv.availableVariants || [];
  if (v.length > 1) {
    if (!v.includes(mv.variantName)) mv.variantName = v[0];
    $('variants').innerHTML = v.map((n, i) => `<button class="chip ${n === mv.variantName ? 'on' : ''}" data-v="${n}">${n.replace(/_/g, ' ')}</button>`).join('');
    $('variants').querySelectorAll('.chip').forEach(c => c.onclick = () => {
      mv.variantName = c.dataset.v; show('3d');
      $('variants').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
    });
    $('variantBox').hidden = false;
  }
  window.__modelLoaded = (window.__modelLoaded || 0) + 1;
});

function qr() {
  if (isMobile) { $('qrBox').hidden = true; return; }
  const q = qrcode(0, 'M'); q.addData(location.origin + location.pathname + '?p=' + key); q.make();
  $('qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  $('qrBox').hidden = false;
}

function updateArNote() {
  if (!isMobile) { $('arNote').textContent = 'AR needs a phone. Scan the QR code to continue on your phone.'; return; }
  if (mv.canActivateAR) { $('arNote').textContent = 'Point your camera at the floor, then move the phone slowly until the product appears life-size.'; }
  else { $('arNote').textContent = 'AR is not available in this browser. On Android use Chrome with Google Play Services for AR; on iPhone use Safari.'; }
}
mv.addEventListener('load', updateArNote);

$('arBtn').onclick = () => {
  if (!isMobile) { $('qrBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('qrBox').classList.add('flash'); setTimeout(() => $('qrBox').classList.remove('flash'), 1200); return; }
  show('3d');
  if (mv.canActivateAR) mv.activateAR(); else updateArNote();
};
$('open3d').onclick = () => { show('3d'); $('mv').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
document.querySelectorAll('.thumb').forEach(t => t.onclick = () => show(t.dataset.view));
mv.addEventListener('ar-status', e => { if (e.detail.status === 'failed') $('arNote').textContent = 'AR could not start on this device. You can still rotate the product in 3D.'; });

tabs(); load(key, false);
