// Set this to the address your phone can open (LAN IP like 'http://192.168.1.20:8000/' or your hosted URL).
// Leave empty to use the current page address.
const PUBLIC_BASE = '';
const $ = id => document.getElementById(id);

// ===== sound effects (made with the browser's Web Audio, no files needed) =====
const SFX = (() => {
  let ctx = null, on = true;
  try { on = localStorage.getItem('pb_sound') !== '0'; } catch (e) {}
  const ac = () => {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  function tone(f, d = .12, type = 'sine', v = .15, to = null, at = 0) {
    const c = on && ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + .03);
  }
  function noise(d = .15, v = .2, f = 800, at = 0) {
    const c = on && ac(); if (!c) return;
    const n = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = f; g.gain.value = v;
    src.connect(hp); hp.connect(g); g.connect(c.destination); src.start(c.currentTime + at);
  }
  return {
    get on() { return on; },
    set(v) { on = v; try { localStorage.setItem('pb_sound', v ? '1' : '0'); } catch (e) {} },
    click:   () => tone(700, .05, 'triangle', .09, 500),
    nav:     () => tone(900, .04, 'triangle', .08),
    pop:     () => tone(500, .09, 'sine', .14, 900),
    close:   () => tone(600, .07, 'sine', .1, 350),
    start:   () => { tone(440, .1, 'triangle', .12, 880); tone(660, .12, 'triangle', .1, 1320, .08); },
    go:      () => { tone(520, .08, 'square', .06, 780); tone(780, .1, 'square', .06, 1040, .08); },
    tick:    last => last ? tone(1175, .28, 'sine', .2) : tone(880, .09, 'sine', .15),
    shutter: () => { noise(.04, .4, 2500); tone(160, .07, 'square', .08, 80); noise(.1, .28, 900, .07); tone(120, .06, 'square', .07, 70, .07); },
    success: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? .5 : .16, 'triangle', .16, null, i * .11)); tone(1319, .6, 'sine', .08, null, .35); },
    download:() => { tone(988, .09, 'sine', .16); tone(1319, .25, 'sine', .16, null, .09); },
    chime:   () => { tone(1047, .3, 'sine', .14); tone(1568, .45, 'sine', .1, null, .12); },
    delete:  () => tone(420, .18, 'sawtooth', .08, 160),
    whoosh:  () => { noise(.28, .16, 400); tone(300, .25, 'sine', .05, 700); },
    error:   () => tone(200, .28, 'sawtooth', .1, 110)
  };
})();
const SFX_MAP = {
  startCam: 'start', snap: 'go', fsBtn: 'whoosh', retake: 'whoosh', mRetake: 'whoosh',
  download: 'download', mDownload: 'download', vDownload: 'download',
  qrBtn: 'chime', mQr: 'chime', vQr: 'chime',
  vDelete: 'delete', histClear: 'delete', gClear: 'delete',
  doneX: 'close', viewX: 'close', histX: 'close', qrClose: 'close',
  vPrev: 'nav', vNext: 'nav', histBtn: 'pop', recentAll: 'pop', editDone: 'chime'
};
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled || !e.isTrusted || b.id === 'sndBtn') return;
  SFX[SFX_MAP[b.id] || 'click']();
});
const video = $('video');
const W = 600, H = 580;
const st = { filter: 'none', count: 3, sticker: '', template: 'classic', timer: 3, layout: 'strip3', titleText: '', bgColor: '#ffd04a', titleFont: 'Fredoka', format: 'strip', frame: 'classic' };
let photos = [], busy = false, animIdx = -1;
const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

const say = t => $('msg').textContent = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

$('track').innerHTML = '<span>REMIX</span><em>✚</em><span>REPEAT</span><em>✚</em><span>CREATE</span><em>✚</em><span>CAPTURE</span><em>✚</em>'.repeat(12);

function pick(groupId, sel, cb) {
  $(groupId).addEventListener('click', e => {
    const b = e.target.closest(sel); if (!b || busy) return;
    $(groupId).querySelectorAll(sel).forEach(x => x.classList.remove('on'));
    b.classList.add('on'); cb(b);
  });
}
pick('vibes', '.vibe', b => { st.filter = b.dataset.f; video.style.filter = st.filter; });
const TEMPLATES = {
  monkey: { title: 'Shangkoy PhotoBooth', layout: 'side', ratio: 1.03, pw: 400, stripW: 400, poses: [1, 2, 3, 4].map(n => `assets/pose${n}.png`), hint: 'Copy the pose shown next to each photo!' },
  trio: { title: 'Trio Vibes', layout: 'side', ratio: 1.5, pw: 440, stripW: 540, poses: [1, 2, 3].map(n => `assets/trio${n}.png`), labels: ['Squad squish', 'Drama time', 'Mood check'], hint: 'Match the vibe of each meme!' },
  duo: { title: 'Double Trouble', layout: 'side', ratio: 1.6, pw: 440, stripW: 540, poses: [1, 2, 3, 4].map(n => `assets/duo${n}.png`), labels: ['Selfie duo', 'Cuddle time', 'Rock on', 'Goat glam'], hint: 'Grab a buddy and copy each duo!' },
  couple: { title: 'Couple Vibes', layout: 'side', ratio: 1.6, pw: 440, stripW: 540, poses: [1, 2, 3, 4].map(n => `assets/couple${n}.png`), labels: ['Sweet kiss', 'Cheek to cheek', 'Tight hug', 'Playful tease'], hint: 'Grab your partner and copy each couple pose!' },
  bunny: { title: 'Bunny Pose', layout: 'side', ratio: 1.13, pw: 440, stripW: 540, poses: [1, 2, 3, 4].map(n => `assets/bunny${n}.png`), labels: ['Secret gossip', 'Shy sparkle', 'Blow a kiss', 'Cheeky wink'], hint: 'Copy the bunny pose shown next to each photo!' }
};
const tpl = () => TEMPLATES[st.template];
pick('tpls', '.tpl', b => { if (b.dataset.t === 'custom') needUnlock(openOwn, syncTplOn); else setTemplate(b.dataset.t); });
function setTemplate(t) { st.template = t; refreshMode(); }
const syncTplOn = () => $('tpls').querySelectorAll('.tpl').forEach(x => x.classList.toggle('on', x.dataset.t === st.template));

// ----- "Create own" template: up to 4 images + editable title, same layout as Duo memes -----
const OWN_MAX = 4;
let ownImgs = Array(OWN_MAX).fill(null), ownTitle = 'My Template', ownTarget = -1;
const ownNote = t => $('ownNote').textContent = t;
function ownRender() {
  $('ownSlots').innerHTML = ownImgs.map((src, i) => src
    ? `<div class="ownslot has" data-i="${i}" role="button" tabindex="0"><span class="n">0${i + 1}</span><img src="${src}" alt="Image ${i + 1}"><button class="rm" type="button" data-rm="${i}" aria-label="Remove image ${i + 1}">✕</button></div>`
    : `<div class="ownslot" data-i="${i}" role="button" tabindex="0"><span class="n">0${i + 1}</span><span>+ Image ${i + 1}</span></div>`).join('');
  $('ownCount').textContent = ownImgs.filter(Boolean).length + ' / ' + OWN_MAX;
}
function openOwn() {
  if (busy) return;
  $('ownTitle').value = ownTitle; ownNote('Add 1 to 4 images. They use the same layout as Duo memes.');
  ownRender(); $('ownDlg').showModal();
}
function fileToCover(file) {            // crop to the template's 1.6 shape so it matches the other templates
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = 1100; c.height = 688;
      drawCover(c.getContext('2d'), im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', .88));
    };
    im.onerror = () => { URL.revokeObjectURL(url); no(new Error('bad image')); };
    im.src = url;
  });
}
async function ownAdd(files, target) {
  files = [...files].filter(f => f.type.startsWith('image/'));
  if (!files.length) return ownNote('Please choose image files.');
  let skipped = 0;
  if (target >= 0) {                    // replace one specific slot
    try { ownImgs[target] = await fileToCover(files[0]); } catch (e) { ownNote('That image could not be read.'); }
    skipped = files.length - 1;
  } else {                              // fill empty slots in order, up to the limit of 4
    for (const f of files) {
      const i = ownImgs.indexOf(null);
      if (i < 0) { skipped++; continue; }
      try { ownImgs[i] = await fileToCover(f); } catch (e) { skipped++; }
    }
  }
  ownRender();
  ownNote(skipped ? `Limit is ${OWN_MAX} images, so ${skipped} extra file${skipped > 1 ? 's were' : ' was'} skipped.` : 'Looking good! Press "Use this template" when ready.');
}
$('ownPick').onclick = () => { ownTarget = -1; $('ownFile').click(); };
$('ownSlots').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { ownImgs[+rm.dataset.rm] = null; ownRender(); return ownNote('Image removed.'); }
  const sl = e.target.closest('.ownslot'); if (!sl) return;
  ownTarget = +sl.dataset.i; $('ownFile').click();
});
$('ownSlots').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('ownslot')) { e.preventDefault(); e.target.click(); } });
$('ownFile').onchange = async e => { const f = [...e.target.files]; e.target.value = ''; const t = ownTarget; ownTarget = -1; if (f.length) await ownAdd(f, t); };
const ownClose = () => $('ownDlg').close();
$('ownX').onclick = $('ownCancel').onclick = ownClose;
$('ownDlg').addEventListener('close', syncTplOn);
function applyOwn(save) {
  const poses = ownImgs.filter(Boolean);
  TEMPLATES.custom = { title: ownTitle, layout: 'side', ratio: 1.6, pw: 440, stripW: 540, poses, hint: 'Copy each pose from your own template!' };
  $('ownIc').innerHTML = `<img src="${poses[0]}" alt="">`;
  if (save) { try { localStorage.setItem('pb_custom', JSON.stringify({ title: ownTitle, imgs: ownImgs })); } catch (e) {} }
}
$('ownDone').onclick = () => {
  if (!ownImgs.some(Boolean)) return ownNote('Add at least 1 image first.');
  ownTitle = $('ownTitle').value.trim() || 'My Template';
  applyOwn(true); ownClose(); setTemplate('custom'); syncTplOn();
};
try {                                   // bring back the saved template after a reload
  const sv = JSON.parse(localStorage.getItem('pb_custom') || 'null');
  if (sv && Array.isArray(sv.imgs) && sv.imgs.some(Boolean)) { ownTitle = sv.title || ownTitle; ownImgs = sv.imgs.slice(0, OWN_MAX); while (ownImgs.length < OWN_MAX) ownImgs.push(null); applyOwn(false); }
} catch (e) {}

// ----- print layouts for the Classic template (units are arbitrary; cells = [x, y, w, h]) -----
const LAYOUTS = {
  strip3: { name: 'Strip 3', w: 40, h: 100, custom: true, count: 3, cells: [[4, 4, 32, 28], [4, 36, 32, 28], [4, 68, 32, 28]] },
  strip4: { name: 'Strip 4', w: 40, h: 100, custom: true, count: 4, cells: [[4, 4, 32, 20], [4, 28, 32, 20], [4, 52, 32, 20], [4, 76, 32, 20]] },
  grid:   { name: 'Grid 4', w: 160, h: 122, cells: [[5, 5, 72.5, 48], [82.5, 5, 72.5, 48], [5, 58, 72.5, 48], [82.5, 58, 72.5, 48]], title: [5, 117, 'start', 6], date: [155, 117, 'end', 4.5] },
  hero:   { name: 'Hero 4', w: 160, h: 113, cells: [[5, 5, 86, 64], [5, 74, 47, 34], [56.5, 74, 47, 34], [108, 74, 47, 34]], title: [125, 32, 'middle', 8], date: [125, 46, 'middle', 5] },
  corner: { name: 'Corner 3', w: 160, h: 113, cells: [[5, 5, 70, 50], [5, 58, 70, 50], [85, 58, 70, 50]], title: [120, 28, 'middle', 8], date: [120, 42, 'middle', 5] },
  side:   { name: 'Side 2', w: 160, h: 113, cells: [[5, 5, 70, 50], [5, 58, 70, 50]], title: [117, 32, 'middle', 8], date: [117, 46, 'middle', 5] },
  banner: { name: 'Banner 2', w: 160, h: 100, cells: [[5, 26, 73, 54], [82, 26, 73, 54]], title: [80, 17, 'middle', 11], date: [80, 93, 'middle', 5] },
  stack:  { name: 'Stack 2', w: 110, h: 146, cells: [[6, 6, 98, 60], [6, 70, 98, 60]], title: [6, 141, 'start', 6], date: [104, 141, 'end', 4.5] },
  solo:   { name: 'Solo', w: 160, h: 114, cells: [[6, 6, 148, 92]], title: [6, 109, 'start', 6], date: [154, 109, 'end', 4.5] }
};
const curLayout = () => (!tpl() && !LAYOUTS[st.layout].custom) ? LAYOUTS[st.layout] : null;
$('lays').innerHTML = Object.entries(LAYOUTS).map(([id, L]) =>
  `<button class="lay${id === 'strip3' ? ' on' : ''}" data-l="${id}"><span class="ic"><svg viewBox="0 0 ${L.w} ${L.h}">${
    L.cells.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff6d6" stroke="#2b2640" stroke-width="${L.w > 100 ? 3 : 2}"/>`).join('')
  }</svg></span>${L.name}</button>`).join('');
pick('lays', '.lay', b => { st.layout = b.dataset.l; refreshMode(); });

function refreshMode(quiet) {
  const T = tpl(), L = curLayout(), LL = LAYOUTS[st.layout];
  st.count = T ? T.poses.length : (LL.count || LL.cells.length);
  photos = []; resetEdits();
  $('layRow').classList.toggle('off', !!T);
  $('stage').classList.toggle('wide', !!(T || L));
  $('stage').style.setProperty('--nw', (T ? T.stripW : L ? (L.w > 130 ? 540 : 340) : 250) + 'px');
  renderSlots(); updateBtns(); retrigger($('stripEl'), 'swap');
  if (!quiet) say(T ? T.hint : '');
}

// board (layout) drawn as SVG for the on-page preview
function boardSVG(L) {
  const ink = '#2b2640';
  let g = '';
  L.cells.forEach(([x, y, w, h], i) => {
    g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".8" fill="#fff6d6" stroke="${ink}" stroke-width="1.2"/>`;
    if (photos[i]) g += `<svg class="${i === animIdx ? 'pop' : ''}" x="${x}" y="${y}" width="${w}" height="${h}"><image href="${photos[i]}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/></svg><rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".8" fill="none" stroke="${ink}" stroke-width="1.2"/>`;
    else g += `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" font-size="3" style="fill:#8c87a3">YOUR PHOTO</text>`;
    g += `<circle cx="${x + 5}" cy="${y + 5}" r="3.4" fill="#67d6e0" stroke="${ink}" stroke-width=".8"/><text x="${x + 5}" y="${y + 6.2}" text-anchor="middle" font-size="3" font-weight="700">0${i + 1}</text>`;
  });
  const txt = (t, v) => t ? `<text x="${t[0]}" y="${t[1]}" text-anchor="${t[2]}" font-size="${v === 700 ? t[3] * .62 : t[3]}" font-weight="${v}">${v === 700 ? 'SHANGKOY PHOTOBOOTH' : new Date().toLocaleDateString()}</text>` : '';
  return `<svg class="board" viewBox="0 0 ${L.w} ${L.h}">${g}${txt(L.title, 700)}${txt(L.date, 500)}</svg>`;
}
pick('timers', 'button', b => { st.timer = +b.dataset.s; $('timerLbl').textContent = st.timer + ' seconds'; });
pick('stickers', '.stk', b => { st.sticker = b.dataset.s; $('stkLive').textContent = st.sticker; retrigger($('stkLive'), 'pop'); });

const narrowMQ = window.matchMedia('(max-width:1500px)');   // strip sits in its own row below the camera
function fitStrip() {
  const box = $('stripcol'), el = $('stripEl'), stage = $('stage'), fs = $('booth').classList.contains('fs');
  if (fs) stage.style.setProperty('--fsw', '48vw'); else stage.style.removeProperty('--fsw');   // measure with the most room first
  box.style.height = '';                                  // back to the stylesheet height before measuring
  if (!box.clientWidth || !box.clientHeight) return;      // strip hidden (phone fullscreen): nothing to fit
  el.style.transform = 'none'; el.style.top = '0px';
  const sW = (box.clientWidth - (fs ? 50 : 40)) / el.offsetWidth, sH = (box.clientHeight - 24) / el.offsetHeight;
  const s = Math.max(.1, Math.min(fs ? 4 : 1.4, sW, sH));
  // tablet/phone: when width is the limit, shrink the box to the strip so there is no big empty gap around it
  if (!fs && narrowMQ.matches && sW < sH) box.style.height = Math.ceil(el.offsetHeight * s + 36) + 'px';
  el.style.transform = `rotate(1.5deg) scale(${s})`;
  el.style.top = Math.max(0, (box.clientHeight - el.offsetHeight * s) / 2) + 'px';   // keep the strip centered in its box
  // fullscreen: give the strip only the width it needs, so the camera takes all the rest
  if (fs) stage.style.setProperty('--fsw', Math.min(Math.ceil(el.offsetWidth * s + 90), window.innerWidth * .48) + 'px');
}
window.addEventListener('resize', fitStrip);
window.addEventListener('orientationchange', () => setTimeout(fitStrip, 200));
window.addEventListener('load', fitStrip);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStrip);
function renderSlots() { renderSlotsInner(); fitStrip(); }
function renderSlotsInner() {
  const s = $('stripEl'), T = tpl(), L = curLayout();
  if (L) { s.innerHTML = boardSVG(L) + '<div class="keep">KEEP IT</div>'; return; }
  s.innerHTML = `<h4><i>✦</i>${T ? T.title : 'Shangkoy Photobooth'}<i>✦</i></h4>`;
  for (let i = 0; i < st.count; i++) {
    const d = document.createElement('div'); d.className = 'slot';
    d.innerHTML = `<b>0${i + 1}</b><span>YOUR PHOTO<br>GOES HERE</span>`;
    if (photos[i]) { const im = new Image(); im.src = photos[i]; im.alt = 'Photo ' + (i + 1); if (i === animIdx) im.className = 'pop'; d.appendChild(im); }
    if (T) {
      const row = document.createElement('div'); row.className = 'row';
      row.style.setProperty('--ar', T.ratio);
      const ref = document.createElement('div'); ref.className = 'slot ref';
      ref.innerHTML = `<img src="${T.poses[i]}" alt="Pose ${i + 1}">` + (T.labels ? `<u>${T.labels[i]}</u>` : '');
      row.append(d, ref); s.appendChild(row);
    } else s.appendChild(d);
  }
  s.insertAdjacentHTML('beforeend', '<div class="sfoot"><span>Made with good energy</span><em>•••</em></div><div class="keep">KEEP IT</div>');
}
function showPose(i) {                       // show the pose to copy for snap i (0-based) and announce it
  const T = tpl(); if (!T) return;
  $('poseImg').src = T.poses[i];
  $('poseHint').classList.toggle('land', T.ratio > 1.2);
  $('poseHint').hidden = false; retrigger($('poseHint'), 'bounce');
  say(T.labels ? `Snap ${i + 1} of ${st.count}: ${T.labels[i]}` : `Snap ${i + 1} of ${st.count}`);
}
function updateBtns() {
  $('retake').disabled = busy || photos.length === 0;
  $('download').disabled = busy || photos.length < st.count;
  $('qrBtn').disabled = $('download').disabled;
}
renderSlots(); updateBtns();

$('startCam').onclick = async () => {
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 960, facingMode: 'user' }, audio: false });
    $('idle').hidden = true; $('snap').disabled = false;
    say('Camera is on. Press the big round button.');
  } catch (e) { say('Camera blocked. Allow camera access, and open this page on localhost or https.'); SFX.error(); }
};

$('snap').onclick = async () => {
  if (busy) return;
  if (!unlocked && takesUsed() >= FREE_TAKES) return needUnlock(() => $('snap').click(), null, `You have used all ${FREE_TAKES} free takes. Enter the code to unlock unlimited takes.`);
  if (!unlocked) bumpTakes();
  busy = true; photos = []; resetEdits(); renderSlots(); $('snap').disabled = true; updateBtns();
  for (let i = 1; i <= st.count; i++) {
    say(`Snap ${i} of ${st.count}`);
    if (tpl()) showPose(i - 1);
    for (let s = st.timer; s > 0; s--) { $('countdown').textContent = s; retrigger($('countdown'), 'tick'); SFX.tick(s === 1); await sleep(1000); }
    $('countdown').textContent = '';
    photos.push(capture()); animIdx = photos.length - 1; SFX.shutter(); flash(); renderSlots(); animIdx = -1;
    await sleep(700);
  }
  busy = false; $('snap').disabled = false; updateBtns();
  await finishSession();
};

async function finishSession() {
  $('poseHint').hidden = true;
  say('Nice! Decorate your strip, then press Finish.'); SFX.success();
  try { await openEditor(); const data = await composeStrip(); await saveHistory(data); openDone(data); say('Nice! Your strip was added to Recent strips.'); }
  catch (e) { if (e && e.message === 'restart') return; say('Your strip is ready. Use Download your strip below.'); }
}


function capture() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const vw = video.videoWidth, vh = video.videoHeight;
  const k = Math.max(W / vw, H / vh), sw = W / k, sh = H / k;
  x.filter = st.filter;
  x.translate(W, 0); x.scale(-1, 1);
  x.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H);
  x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none';
  if (st.sticker) { x.font = '130px serif'; x.textAlign = 'right'; x.textBaseline = 'alphabetic'; x.fillText(st.sticker, W - 24, H - 28); }
  return c.toDataURL('image/jpeg', .92);
}
function flash() { retrigger($('flash'), 'on'); retrigger(document.querySelector('.screen'), 'kick'); }

const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
function drawCover(x, im, dx, dy, dw, dh) {
  const k = Math.max(dw / im.width, dh / im.height), sw = dw / k, sh = dh / k;
  x.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, dx, dy, dw, dh);
}
function rr(x, px, py, w, h, r) { x.beginPath(); x.roundRect ? x.roundRect(px, py, w, h, r) : x.rect(px, py, w, h); }
async function composeBoard(L) {
  const k = 6, ink = '#2b2640';
  const c = document.createElement('canvas'); c.width = L.w * k; c.height = L.h * k;
  const x = c.getContext('2d');
  x.fillStyle = st.bgColor; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = ink; x.lineWidth = 12; x.strokeRect(0, 0, c.width, c.height); x.lineJoin = 'round';
  const imgs = await Promise.all(photos.map(loadImg));
  L.cells.forEach(([cx, cy, w, h], i) => {
    if (!imgs[i]) return;
    drawCover(x, imgs[i], cx * k, cy * k, w * k, h * k); x.lineWidth = 5; x.strokeRect(cx * k, cy * k, w * k, h * k);
  });
  x.fillStyle = ink;
  const put = (t, text, wt, sc = 1, fit = 0, fk = '') => {
    if (!t) return; x.textAlign = t[2] === 'middle' ? 'center' : t[2] === 'end' ? 'right' : 'left';
    let fs = t[3] * sc * k; x.font = fk ? fnt(fk, fs) : `${wt} ${fs}px Fredoka, sans-serif`;
    if (fit) { const avail = (t[2] === 'middle' ? 2 * Math.min(t[0], L.w - t[0]) - 8 : L.w - t[0] - 45) * k, w = x.measureText(text).width; if (w > avail) { fs *= avail / w; x.font = fk ? fnt(fk, fs) : `${wt} ${fs}px Fredoka, sans-serif`; } }
    x.fillText(text, t[0] * k, t[1] * k);
  };
  put(L.title, st.titleText || 'SHANGKOY PHOTOBOOTH', 700, st.titleText ? .9 : .62, 1, st.titleFont); put(L.date, new Date().toLocaleDateString(), 500);
  return c.toDataURL('image/png');
}
// Instagram Story / My Day layout: a full-screen 1080x1920 (9:16) collage. Pictures touch each other and fill the
// whole screen edge to edge, like Instagram's own Layout tool, so there is no background, border or gap.
async function storyStrip() {
  const SW = 1080, SH = 1920, T = tpl(), n = photos.length;
  const c = document.createElement('canvas'); c.width = SW; c.height = SH;
  const x = c.getContext('2d');
  const imgs = await Promise.all(photos.map(loadImg));
  const refs = T ? await Promise.all(T.poses.slice(0, n).map(loadImg)) : [];
  if (T) {
    // Pose templates: full-screen collage, one row per snap: your photo | the pose to copy.
    // The pose is shown whole (never cropped); the leftover space in its cell is filled with a blurred copy of the pose itself.
    const ch = SH / n, cw = SW / 2;
    imgs.forEach((im, i) => {
      const y = i * ch, rx = cw, ref = refs[i];
      drawCover(x, im, 0, y, cw, ch);
      x.save(); x.beginPath(); x.rect(rx, y, cw, ch); x.clip();
      x.filter = 'blur(28px)'; drawCover(x, ref, rx - 60, y - 60, cw + 120, ch + 120); x.filter = 'none';
      const k = Math.min(cw / ref.width, ch / ref.height), rw = ref.width * k, rh = ref.height * k;
      x.drawImage(ref, rx + (cw - rw) / 2, y + (ch - rh) / 2, rw, rh);
      x.restore();
      if (T.labels) {
        x.font = '700 26px "Space Mono", monospace'; x.textAlign = 'left';
        const label = T.labels[i].toUpperCase(), lw = x.measureText(label).width + 40;
        x.fillStyle = '#f44d6a'; rr(x, rx + 16, y + 16, lw, 46, 23); x.fill(); x.lineWidth = 6; x.strokeStyle = '#2b2640'; x.stroke();
        x.fillStyle = '#fff'; x.fillText(label, rx + 36, y + 49);
      }
    });
    return c.toDataURL('image/png');
  }
  const rows = n <= 3 ? Array.from({ length: n }, () => 1) : Array.from({ length: Math.ceil(n / 2) }, (_, r) => (r * 2 + 1 < n ? 2 : 1));
  const ch = SH / rows.length;
  let i = 0;
  rows.forEach((k, r) => { for (let j = 0; j < k; j++, i++) drawCover(x, imgs[i], j * SW / k, r * ch, SW / k, ch); });
  return c.toDataURL('image/png');
}
// ---- Frame designs for the single-column photo strip: Photoism, Train ticket, Instagram posts, Film ----
const FRAME_BG = { classic: '#ffd04a', photoism: '#ffffff', ticket: '#ffffff', insta: '#ffffff', film: '#2b2640', music: '#ffffff', doodle: '#ffffff', grid2: '#ffffff', cuts: '#ffffff' };
const isDark = h => { const v = parseInt(h.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255; return (r * 299 + g * 587 + b * 114) / 1000 < 140; };
function burst(x, cx, cy, r, spikes, fill) {
  x.beginPath();
  for (let i = 0; i < spikes * 2; i++) { const a = Math.PI * i / spikes, rad = i % 2 ? r * .62 : r; x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
  x.closePath(); x.fillStyle = fill; x.fill();
}
function sparkle(x, cx, cy, r, fill) {
  x.beginPath(); x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r);
  x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r); x.closePath(); x.fillStyle = fill; x.fill();
}
function ghost(x, cx, cy, s, ink) {                 // little cloud mascot
  x.save(); x.translate(cx, cy); x.scale(s, s);
  x.beginPath(); x.moveTo(-34, 14); x.bezierCurveTo(-52, 8, -48, -22, -26, -22); x.bezierCurveTo(-24, -42, 8, -48, 14, -28);
  x.bezierCurveTo(36, -34, 50, -8, 36, 6); x.bezierCurveTo(52, 20, 36, 34, 20, 28); x.bezierCurveTo(10, 40, -12, 38, -18, 28); x.bezierCurveTo(-30, 34, -44, 26, -34, 14); x.closePath();
  x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 3.5; x.strokeStyle = ink; x.stroke();
  x.fillStyle = ink; [-11, 11].forEach(ex => { x.beginPath(); x.arc(ex, -2, 3.2, 0, 7); x.fill(); });
  x.fillStyle = '#ff9fb0'; [-20, 20].forEach(ex => { x.beginPath(); x.arc(ex, 6, 4.5, 0, 7); x.fill(); });
  x.lineWidth = 2.5; x.beginPath(); x.arc(0, 4, 4, .1 * Math.PI, .9 * Math.PI); x.stroke();
  x.restore();
}
function heartPath(x, cx, cy, s) { x.beginPath(); x.moveTo(cx, cy + s); x.bezierCurveTo(cx - s * 2, cy - s * .2, cx - s * .7, cy - s * 1.6, cx, cy - s * .5); x.bezierCurveTo(cx + s * .7, cy - s * 1.6, cx + s * 2, cy - s * .2, cx, cy + s); }
function qrLike(x, px, py, size, ink, bg, seed) {   // decorative QR-style block (not a real code)
  const N = 21, cs = size / N; let s = (seed >>> 0) || 7;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  x.fillStyle = ink;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const inF = (r < 8 && c < 8) || (r < 8 && c > N - 9) || (r > N - 9 && c < 8);
    if (!inF && rnd() > .5) x.fillRect(px + c * cs, py + r * cs, cs, cs);
  }
  [[0, 0], [N - 7, 0], [0, N - 7]].forEach(([fx, fy]) => {
    x.fillStyle = ink; x.fillRect(px + fx * cs, py + fy * cs, 7 * cs, 7 * cs);
    x.fillStyle = bg; x.fillRect(px + (fx + 1) * cs, py + (fy + 1) * cs, 5 * cs, 5 * cs);
    x.fillStyle = ink; x.fillRect(px + (fx + 2) * cs, py + (fy + 2) * cs, 3 * cs, 3 * cs);
  });
}
// Photos only (no background, title or frame) for pose templates and board layouts, so they can sit inside any frame design
async function contentCanvas() {
  const T = tpl(), L = curLayout(), n = photos.length, ink = '#2b2640';
  const imgs = await Promise.all(photos.map(loadImg));
  const c = document.createElement('canvas'); let x;
  if (T) {
    const pw = T.pw, ph = Math.round(pw / T.ratio), gap = 14, rg = 14, refs = await Promise.all(T.poses.slice(0, n).map(loadImg));
    c.width = pw * 2 + rg + 6; c.height = n * ph + (n - 1) * gap + 6; x = c.getContext('2d'); x.lineJoin = 'round'; x.strokeStyle = ink; x.lineWidth = 4;
    imgs.forEach((im, i) => {
      const y = 3 + i * (ph + gap), rx = 3 + pw + rg;
      drawCover(x, im, 3, y, pw, ph); x.strokeRect(3, y, pw, ph);
      drawCover(x, refs[i], rx, y, pw, ph); x.strokeRect(rx, y, pw, ph);
      if (T.labels) {
        x.font = '700 18px "Space Mono", monospace'; x.textAlign = 'left';
        const label = T.labels[i].toUpperCase(), lw = x.measureText(label).width + 28;
        x.fillStyle = '#f44d6a'; rr(x, rx + 12, y + 12, lw, 32, 16); x.fill(); x.lineWidth = 4; x.stroke();
        x.fillStyle = '#ffffff'; x.fillText(label, rx + 26, y + 34);
      }
    });
  } else {
    const k = 6, cells = L.cells.slice(0, n);
    const x0 = Math.min(...cells.map(q => q[0])), y0 = Math.min(...cells.map(q => q[1])), x1 = Math.max(...cells.map(q => q[0] + q[2])), y1 = Math.max(...cells.map(q => q[1] + q[3]));
    c.width = Math.round((x1 - x0) * k) + 6; c.height = Math.round((y1 - y0) * k) + 6; x = c.getContext('2d'); x.lineJoin = 'round'; x.strokeStyle = ink; x.lineWidth = 5;
    cells.forEach(([cx, cy, w, h], i) => { const px = 3 + (cx - x0) * k, py = 3 + (cy - y0) * k; drawCover(x, imgs[i], px, py, w * k, h * k); x.strokeRect(px, py, w * k, h * k); });
  }
  return c;
}
async function designStrip() {
  await Promise.all(['700 20px "Space Mono"', '400 20px Fredoka', '600 20px Fredoka', '700 20px Fredoka'].map(f => document.fonts.load(f)));
  const f = st.frame, wrap = !!(tpl() || curLayout());          // pose templates and board layouts go in as one picture
  let sp = 0, imgs;
  if (wrap) { const cc = await contentCanvas(); sp = cc.width / cc.height; imgs = [cc]; } else imgs = await Promise.all(photos.map(loadImg));
  const n = imgs.length, ph1 = (pw, d) => sp ? Math.round(pw / sp) : d;
  const bg = st.bgColor, dark = isDark(bg), ink = dark ? '#ffffff' : '#1f1d2b', sub = dark ? '#c9c6dc' : '#6b6880';
  const ttl = (st.titleText || '').trim(), now = new Date();
  let c, x;
  const mk = (w, h) => { c = document.createElement('canvas'); c.width = w; c.height = h; x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.lineJoin = 'round'; x.lineCap = 'round'; };
  const fitTo = (t, mkFont, px, maxW) => { x.font = mkFont(px); const w = x.measureText(t).width; if (w > maxW) { px = Math.max(8, Math.floor(px * maxW / w)); x.font = mkFont(px); } return px; };
  const mono = (w, px) => `${w} ${px}px "Space Mono", monospace`, fre = (w, px) => `${w} ${px}px Fredoka, sans-serif`;
  const p2 = v => String(v).padStart(2, '0');
  const spacing = v => { if ('letterSpacing' in x) x.letterSpacing = v; };

  if (f === 'photoism') {
    const side = 58, pw = 470, ph = ph1(pw, 360), gap = 20, top = 130, bot = 120, W = side * 2 + pw, H = top + n * ph + (n - 1) * gap + bot;
    mk(W, H);
    const name = (ttl || 'shangkoy photobooth').toLowerCase();
    x.strokeStyle = sub; x.lineWidth = 3; rr(x, 8, 8, W - 16, H - 16, 14); x.stroke();
    x.fillStyle = ink; rr(x, W / 2 - 135, 34, 270, 62, 31); x.fill();
    x.fillStyle = bg; x.textAlign = 'center'; fitTo(name, p => fnt(st.titleFont, p), 30, 220); x.fillText(name, W / 2, 76);
    imgs.forEach((im, i) => {
      const y = top + i * (ph + gap);
      drawCover(x, im, side, y, pw, ph); x.strokeStyle = ink; x.lineWidth = 3; x.strokeRect(side, y, pw, ph);
      x.fillStyle = ink; x.textAlign = 'center'; x.font = mono(700, 16); x.fillText(String(i + 1), side / 2, y + ph / 2 - 6);
      x.beginPath(); x.moveTo(side / 2, y + ph / 2 + 6); x.lineTo(side / 2 - 6, y + ph / 2 + 18); x.lineTo(side / 2 + 6, y + ph / 2 + 18); x.closePath(); x.fill();
      const side2 = i % 2 ? name.toUpperCase() : 'KEEP SMILING';
      spacing('3px'); x.save(); x.translate(W - side / 2 + 5, y + ph / 2); x.rotate(-Math.PI / 2); x.textAlign = 'center';
      fitTo(side2, p => mono(700, p), 15, ph - 60); x.fillStyle = ink; x.fillText(side2, 0, 0); x.restore(); spacing('0px');
      const k = i % 3;
      if (k === 0) { burst(x, side + pw - 34, y + 38, 22, 9, ink); sparkle(x, side + pw - 34, y + 38, 8, bg); }
      if (k === 1) ghost(x, side + 62, y + ph - 46, .95, ink);
      if (k === 2) { burst(x, side + 36, y + 40, 20, 8, ink); sparkle(x, side + 36, y + 40, 7, bg); sparkle(x, side + pw - 36, y + ph - 40, 12, '#ffffff'); }
    });
    x.fillStyle = sub; x.textAlign = 'center'; x.font = fre(400, 19); x.fillText('keep smiling at', W / 2, H - 66);
    x.fillStyle = ink; fitTo(name, p => fnt(st.titleFont, p), 32, W - 220); x.fillText(name, W / 2, H - 28);
    ghost(x, W - 74, H - 58, .8, ink);
  }

  if (f === 'ticket') {
    const pad = 40, pw = 480, ph = ph1(pw, 330), gap = 16, top = 62, stub = 262, W = pad * 2 + pw, ys = top + n * ph + (n - 1) * gap + 30, H = ys + stub;
    mk(W, H);
    x.strokeStyle = ink; x.lineWidth = 4; rr(x, 6, 6, W - 12, H - 12, 20); x.stroke();
    x.fillStyle = sub; x.textAlign = 'center'; x.font = mono(700, 14); spacing('3px'); x.fillText('PHOTO TICKET · ADMIT ONE', W / 2, 40); spacing('0px');
    imgs.forEach((im, i) => { const y = top + i * (ph + gap); drawCover(x, im, pad, y, pw, ph); x.strokeStyle = ink; x.lineWidth = 3; x.strokeRect(pad, y, pw, ph); });
    x.setLineDash([10, 8]); x.strokeStyle = sub; x.lineWidth = 2; x.beginPath(); x.moveTo(pad - 20, ys); x.lineTo(W - pad + 20, ys); x.stroke(); x.setLineDash([]);
    const station = (ttl || 'Shangkoy Station').toUpperCase();
    x.textAlign = 'left'; x.fillStyle = ink; fitTo(station, p => mono(700, p), 25, 300); x.fillText(station, pad, ys + 50);
    x.fillStyle = ink; x.fillRect(pad, ys + 64, 300, 3);
    x.fillStyle = sub; x.font = mono(700, 15); x.fillText('FIRST CLASS', pad, ys + 92);
    const row = (label, val, y) => { x.fillStyle = sub; x.font = mono(700, 12); x.fillText(label, pad, y); x.fillStyle = ink; fitTo(val, p => mono(700, p), 24, 290); x.fillText(val, pad, y + 26); };
    row('DEPARTURE', 'STRANGER', ys + 130); row('ARRIVAL', 'FRIENDSHIP', ys + 188);
    x.fillStyle = sub; x.font = mono(700, 12); x.fillText('No. ' + String(now.getTime()).slice(-6), pad, ys + 246);
    const x0 = pad + 330, p2 = v => String(v).padStart(2, '0');
    x.fillStyle = sub; x.font = mono(700, 12); x.fillText('BOARDING', x0, ys + 50);
    x.fillStyle = ink; x.font = mono(700, 58); x.fillText(p2(now.getDate()), x0, ys + 108);
    x.font = mono(700, 24); x.fillText(p2(now.getHours()) + ':' + p2(now.getMinutes()), x0, ys + 146);
    x.fillStyle = sub; x.font = mono(700, 13); x.fillText(now.toLocaleString('en', { month: 'short' }).toUpperCase() + ' ' + now.getFullYear(), x0, ys + 168);
    qrLike(x, W - pad - 82, ys + 168, 82, ink, bg, now.getDate() * 97 + n);
  }

  if (f === 'insta') {
    const m = 22, pw = 500, ph = ph1(pw, 340), hdr = 56, ftr = 96, W = pw + m * 2, gap = 8, topPad = 22, post = hdr + ph + ftr, playH = 250;
    const H = topPad + n * post + (n - 1) * gap + playH;
    mk(W, H);
    const user = (ttl || 'shangkoy.photobooth').toLowerCase().replace(/\s+/g, '.');
    const caps = ['good vibes only', 'my day today', 'snap snap snap', 'best day ever'];
    imgs.forEach((im, i) => {
      const y = topPad + i * (post + gap), py = y + hdr + ph;
      const g = x.createLinearGradient(m, y, m + 38, y + 38); g.addColorStop(0, '#f9ce34'); g.addColorStop(.5, '#ee2a7b'); g.addColorStop(1, '#6228d7');
      x.beginPath(); x.arc(m + 18, y + 28, 19, 0, 7); x.fillStyle = g; x.fill();
      x.beginPath(); x.arc(m + 18, y + 28, 15, 0, 7); x.fillStyle = bg; x.fill();
      x.beginPath(); x.arc(m + 18, y + 28, 12, 0, 7); x.fillStyle = '#d9d6e6'; x.fill();
      x.textAlign = 'left'; x.fillStyle = ink; x.font = fre(600, 17); x.fillText(user, m + 46, y + 34);
      const ux = m + 46 + x.measureText(user).width + 14;
      x.beginPath(); x.arc(ux, y + 28, 8, 0, 7); x.fillStyle = '#3797f0'; x.fill();
      x.strokeStyle = '#ffffff'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(ux - 4, y + 28); x.lineTo(ux - 1, y + 31); x.lineTo(ux + 4, y + 25); x.stroke();
      x.fillStyle = ink; [0, 1, 2].forEach(d => { x.beginPath(); x.arc(m + pw - 8, y + 20 + d * 8, 2, 0, 7); x.fill(); });
      drawCover(x, im, m, y + hdr, pw, ph);
      const iy = py + 30, hx = m + 14, hs = 9; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(hx, iy + hs); x.bezierCurveTo(hx - hs * 2, iy - hs * .2, hx - hs * .7, iy - hs * 1.5, hx, iy - hs * .5);
      x.bezierCurveTo(hx + hs * .7, iy - hs * 1.5, hx + hs * 2, iy - hs * .2, hx, iy + hs);
      if (i % 2 === 0) { x.fillStyle = '#ed4956'; x.fill(); x.strokeStyle = '#ed4956'; } else x.strokeStyle = ink;
      x.stroke();
      x.strokeStyle = ink;
      x.beginPath(); x.arc(m + 56, iy, 11, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(m + 49, iy + 9); x.lineTo(m + 44, iy + 15); x.lineTo(m + 54, iy + 12); x.stroke();
      x.beginPath(); x.moveTo(m + 88, iy - 2); x.lineTo(m + 113, iy - 11); x.lineTo(m + 104, iy + 12); x.lineTo(m + 99, iy + 3); x.closePath();
      x.moveTo(m + 99, iy + 3); x.lineTo(m + 113, iy - 11); x.stroke();
      const bx = m + pw - 12;
      x.beginPath(); x.moveTo(bx - 9, iy - 11); x.lineTo(bx + 9, iy - 11); x.lineTo(bx + 9, iy + 12); x.lineTo(bx, iy + 4); x.lineTo(bx - 9, iy + 12); x.closePath(); x.stroke();
      x.fillStyle = ink; x.font = fre(600, 15); x.fillText((1200 + i * 337).toLocaleString('en') + ' likes', m, py + 62);
      x.fillText(user, m, py + 84); const uw = x.measureText(user).width;
      x.font = fre(400, 15); x.fillText(caps[i % 4], m + uw + 8, py + 84);
    });
    const p0 = topPad + n * post + (n - 1) * gap + 14;
    x.textAlign = 'left'; x.fillStyle = ink; x.font = fre(700, 21); x.fillText('Good Energy', m, p0 + 28);
    x.fillStyle = sub; fitTo(ttl || 'Shangkoy Photobooth', p => fre(400, p), 15, 250); x.fillText(ttl || 'Shangkoy Photobooth', m, p0 + 50);
    const cx0 = m + pw - 176;
    x.beginPath(); x.arc(cx0, p0 + 28, 13, 0, 7); x.fillStyle = ink; x.fill();
    x.strokeStyle = bg; x.lineWidth = 2; [[-6, 7], [-4.5, 5], [-3, 3]].forEach(([dy, r]) => { x.beginPath(); x.arc(cx0, p0 + 28 - dy + 4, r, 1.15 * Math.PI, 1.85 * Math.PI); x.stroke(); });
    x.strokeStyle = ink; x.lineWidth = 3;
    for (let b = 0; b < 26; b++) { const hh = 6 + ((b * 53) % 7) * 3.4; x.beginPath(); x.moveTo(cx0 + 26 + b * 5.4, p0 + 28 - hh / 2); x.lineTo(cx0 + 26 + b * 5.4, p0 + 28 + hh / 2); x.stroke(); }
    const ly = p0 + 88, kx = m + pw * .38;
    x.fillStyle = dark ? '#555' : '#d4d2de'; rr(x, m, ly - 2, pw, 4, 2); x.fill();
    x.fillStyle = ink; rr(x, m, ly - 2, pw * .38, 4, 2); x.fill(); x.beginPath(); x.arc(kx, ly, 7, 0, 7); x.fill();
    x.fillStyle = sub; x.font = fre(400, 12); x.textAlign = 'left'; x.fillText('0:42', m, ly + 24); x.textAlign = 'right'; x.fillText('-2:18', m + pw, ly + 24);
    const cy = p0 + 172, mid = W / 2;
    x.fillStyle = ink; x.beginPath(); x.arc(mid, cy, 30, 0, 7); x.fill();
    x.fillStyle = bg; x.fillRect(mid - 10, cy - 11, 6.5, 22); x.fillRect(mid + 3.5, cy - 11, 6.5, 22);
    x.fillStyle = ink;
    x.fillRect(mid - 102, cy - 11, 3.5, 22); x.beginPath(); x.moveTo(mid - 79, cy - 11); x.lineTo(mid - 97, cy); x.lineTo(mid - 79, cy + 11); x.closePath(); x.fill();
    x.fillRect(mid + 98.5, cy - 11, 3.5, 22); x.beginPath(); x.moveTo(mid + 79, cy - 11); x.lineTo(mid + 97, cy); x.lineTo(mid + 79, cy + 11); x.closePath(); x.fill();
    x.strokeStyle = ink; x.lineWidth = 2.2;
    const sx = m + 22; x.beginPath(); x.moveTo(sx - 12, cy + 8); x.lineTo(sx - 4, cy + 8); x.lineTo(sx + 6, cy - 8); x.lineTo(sx + 12, cy - 8); x.moveTo(sx - 12, cy - 8); x.lineTo(sx - 4, cy - 8); x.lineTo(sx + 6, cy + 8); x.lineTo(sx + 12, cy + 8); x.stroke();
    rr(x, m + pw - 34, cy - 8, 24, 16, 6); x.stroke();
    x.strokeStyle = dark ? '#555' : '#dcdce2'; x.lineWidth = 3; rr(x, 5, 5, W - 10, H - 10, 24); x.stroke();
  }

  if (f === 'film') {
    const side = 70, pw = 440, ph = ph1(pw, 330), gap = 34, top = 44, bot = 44, W = side * 2 + pw, H = top + n * ph + (n - 1) * gap + bot;
    mk(W, H);
    const hole = dark ? '#f1ede2' : '#ffffff', tag = dark ? '#ffb03a' : '#d9791a';
    for (let yy = 12; yy < H - 24; yy += 36) [22, W - 48].forEach(hx => {
      x.fillStyle = hole; rr(x, hx, yy, 26, 20, 6); x.fill();
      if (!dark) { x.strokeStyle = ink; x.lineWidth = 2; x.stroke(); }
    });
    x.fillStyle = tag; x.textAlign = 'center'; x.font = mono(700, 14); spacing('4px'); x.fillText((ttl || 'Shangkoy 400').toUpperCase(), W / 2, 30); spacing('0px');
    imgs.forEach((im, i) => {
      const y = top + i * (ph + gap);
      drawCover(x, im, side, y, pw, ph);
      if (!dark) { x.strokeStyle = ink; x.lineWidth = 3; x.strokeRect(side, y, pw, ph); }
      x.fillStyle = tag; x.font = mono(700, 14); x.textAlign = 'left'; x.fillText(`${i + 1}A  >`, side, y + ph + 22);
      x.textAlign = 'right'; x.fillText(String(i + 1), side + pw, y + ph + 22);
    });
  }
  if (f === 'music') {                              // music-player print: round photos on top, "now playing" bar and controls at the bottom
    const side = 30, pw = 460, ph = ph1(pw, 350), gap = 14, top = 78, W = side * 2 + pw, plH = 262, H = top + n * ph + (n - 1) * gap + 22 + plH;
    mk(W, H);
    x.fillStyle = ink; x.beginPath(); x.arc(side + 14, 40, 14, 0, 7); x.fill();
    x.strokeStyle = bg; x.lineWidth = 2.2; [[-5, 7.5], [-3, 5.5], [-1, 3.5]].forEach(([dy, r]) => { x.beginPath(); x.arc(side + 14, 40 - dy + 5, r, 1.15 * Math.PI, 1.85 * Math.PI); x.stroke(); });
    x.fillStyle = ink; x.textAlign = 'left'; x.font = fre(700, 17); x.fillText('now playing', side + 38, 46);
    x.strokeStyle = sub; x.lineWidth = 3;
    for (let b = 0; b < 40; b++) { const hh = 6 + ((b * 37) % 9) * 3.2, bx = W - side - 210 + b * 5.2; x.beginPath(); x.moveTo(bx, 40 - hh / 2); x.lineTo(bx, 40 + hh / 2); x.stroke(); }
    imgs.forEach((im, i) => {
      const y = top + i * (ph + gap);
      x.save(); rr(x, side, y, pw, ph, 16); x.clip(); drawCover(x, im, side, y, pw, ph); x.restore();
      x.strokeStyle = ink; x.lineWidth = 3; rr(x, side, y, pw, ph, 16); x.stroke();
    });
    const p0 = top + n * ph + (n - 1) * gap + 22, mid = W / 2, song = ttl || 'Shangkoy Photobooth';
    x.textAlign = 'center'; x.fillStyle = ink; fitTo(song, p => fre(700, p), 24, pw); x.fillText(song, mid, p0 + 30);
    x.fillStyle = sub; x.font = fre(400, 14); x.fillText('good energy · ' + now.toLocaleDateString(), mid, p0 + 52);
    const ly = p0 + 92, kx = side + pw * .38, cy = p0 + 172;
    x.fillStyle = dark ? '#555' : '#d4d2de'; rr(x, side, ly - 2, pw, 4, 2); x.fill();
    x.fillStyle = ink; rr(x, side, ly - 2, pw * .38, 4, 2); x.fill(); x.beginPath(); x.arc(kx, ly, 7, 0, 7); x.fill();
    x.fillStyle = sub; x.font = fre(400, 12); x.textAlign = 'left'; x.fillText('0:42', side, ly + 24); x.textAlign = 'right'; x.fillText('-2:18', side + pw, ly + 24);
    x.fillStyle = ink; x.beginPath(); x.arc(mid, cy, 30, 0, 7); x.fill();
    x.fillStyle = bg; x.fillRect(mid - 10, cy - 11, 6.5, 22); x.fillRect(mid + 3.5, cy - 11, 6.5, 22);
    x.fillStyle = ink;
    x.fillRect(mid - 102, cy - 11, 3.5, 22); x.beginPath(); x.moveTo(mid - 79, cy - 11); x.lineTo(mid - 97, cy); x.lineTo(mid - 79, cy + 11); x.closePath(); x.fill();
    x.fillRect(mid + 98.5, cy - 11, 3.5, 22); x.beginPath(); x.moveTo(mid + 79, cy - 11); x.lineTo(mid + 97, cy); x.lineTo(mid + 79, cy + 11); x.closePath(); x.fill();
    x.strokeStyle = ink; x.lineWidth = 2.2;
    const sx = side + 22; x.beginPath(); x.moveTo(sx - 12, cy + 8); x.lineTo(sx - 4, cy + 8); x.lineTo(sx + 6, cy - 8); x.lineTo(sx + 12, cy - 8); x.moveTo(sx - 12, cy - 8); x.lineTo(sx - 4, cy - 8); x.lineTo(sx + 6, cy + 8); x.lineTo(sx + 12, cy + 8); x.stroke();
    rr(x, side + pw - 34, cy - 8, 24, 16, 6); x.stroke();
  }

  if (f === 'doodle') {                             // outlined name pill, heart-arrow, QR block and tiny doodles between the photos
    const side = 38, W = 520, pw = W - side * 2, ph = ph1(pw, 335), gap = 24, top = 120, bot = 70, H = top + n * ph + (n - 1) * gap + bot;
    mk(W, H);
    const name = (ttl || 'shangkoy pix').toUpperCase();
    x.strokeStyle = ink; x.lineWidth = 4; rr(x, W / 2 - 120, 40, 240, 62, 31); x.stroke();
    x.fillStyle = ink; x.textAlign = 'center'; fitTo(name, p => fnt(st.titleFont, p), 28, 190); x.fillText(name, W / 2, 80);
    x.lineWidth = 3; heartPath(x, side + 34, 66, 11); x.stroke();
    x.beginPath(); x.moveTo(side + 4, 90); x.lineTo(side + 66, 44); x.moveTo(side + 66, 44); x.lineTo(side + 55, 46); x.moveTo(side + 66, 44); x.lineTo(side + 62, 55); x.stroke();
    qrLike(x, W - side - 66, 30, 66, ink, bg, now.getDate() * 31 + n);
    imgs.forEach((im, i) => {
      const y = top + i * (ph + gap); drawCover(x, im, side, y, pw, ph);
      if (i < n - 1) {
        const dy = y + ph + gap / 2, k = i % 3; x.strokeStyle = ink; x.lineWidth = 2;
        if (k === 0) { x.beginPath(); x.moveTo(side + 4, dy - 4); x.lineTo(side + 12, dy + 4); x.moveTo(side + 12, dy - 4); x.lineTo(side + 4, dy + 4); x.stroke(); }
        if (k === 1) { heartPath(x, side + pw - 14, dy, 5); x.stroke(); }
        if (k === 2) { x.beginPath(); for (let s = 0; s < 10; s++) { const a = -Math.PI / 2 + s * Math.PI / 5, r = s % 2 ? 3.5 : 8; x[s ? 'lineTo' : 'moveTo'](side + 12 + Math.cos(a) * r, dy + Math.sin(a) * r); } x.closePath(); x.stroke(); }
      }
    });
    x.strokeStyle = ink; x.lineWidth = 2; heartPath(x, side + 10, H - 30, 6); x.stroke();
    x.fillStyle = sub; x.font = mono(700, 13); x.textAlign = 'center'; x.fillText(now.toLocaleDateString(), W / 2, H - 26);
  }

  if (f === 'grid2') {                              // two columns of slightly offset photos, small caption row at the bottom
    const W = 540, side = 28, pw = sp ? 484 : 236, ph = ph1(pw, 228), gx = 24, gy = 20, top = 96, bot = 80, rows = Math.ceil(n / 2), H = top + rows * ph + (rows - 1) * gy + 12 + bot;
    mk(W, H);
    x.fillStyle = ink; x.beginPath(); x.moveTo(side, 20); x.lineTo(side + 8, 25); x.lineTo(side, 30); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(W * .42, 20); x.lineTo(W * .42 + 8, 25); x.lineTo(W * .42, 30); x.closePath(); x.fill();
    x.font = mono(700, 10); x.textAlign = 'left'; x.fillText(String(n), W * .42 + 14, 29);
    const name = (ttl || 'shangkoy').toLowerCase();
    x.textAlign = 'right'; fitTo(name, p => fnt(st.titleFont, p), 36, 260); x.fillText(name, W - side, 58);
    imgs.forEach((im, i) => {
      const r = Math.floor(i / 2), col = i % 2, odd = i === n - 1 && n % 2 === 1;
      const px = odd ? (W - pw) / 2 : side + col * (pw + gx) + (r % 2 ? 4 : 0), py = top + r * (ph + gy) + (col ? 12 : 0);
      drawCover(x, im, px, py, pw, ph);
    });
    const ly = H - 28; x.fillStyle = ink; x.font = mono(700, 11); spacing('1px');
    x.textAlign = 'left'; x.fillText('KEEP SMILING', side, ly);
    x.textAlign = 'center'; x.fillText(p2(now.getMonth() + 1) + '.' + p2(now.getDate()), W * .36, ly);
    fitTo(name.toUpperCase(), p => mono(700, p), 11, 120); x.fillText(name.toUpperCase(), W * .64, ly);
    x.font = mono(700, 11); x.textAlign = 'right'; x.fillText('KEEP SMILING', W - side, ly); spacing('0px');
  }

  if (f === 'cuts') {                               // pastel-photo "four cuts" strip: side markers, big title and date at the bottom
    const side = 46, pw = 408, ph = ph1(pw, 292), gap = 12, top = 20, bot = 200, W = side * 2 + pw, H = top + n * ph + (n - 1) * gap + bot;
    mk(W, H);
    const label = (ttl || 'four cuts').toUpperCase(), numTxt = String(now.getMonth() + 1) + p2(now.getDate());
    imgs.forEach((im, i) => {
      const y = top + i * (ph + gap), left = i % 2 === 0, cx = left ? side / 2 : W - side / 2, isNum = i % 4 === 0 || i % 4 === 3;
      drawCover(x, im, side, y, pw, ph);
      x.fillStyle = ink; x.beginPath(); x.moveTo(cx - 5, y + 14); x.lineTo(cx + 5, y + 14); x.lineTo(cx, y + 24); x.closePath(); x.fill();
      const t = isNum ? numTxt : label;
      spacing('2px'); x.save(); x.translate(cx + 4, y + ph / 2 + 14); x.rotate(-Math.PI / 2); x.textAlign = 'center';
      fitTo(t, p => mono(700, p), 12, ph - 90); x.fillStyle = ink; x.fillText(t, 0, 0); x.restore(); spacing('0px');
    });
    const big = ttl || 'Four Cuts';
    x.fillStyle = ink; x.textAlign = 'center'; fitTo(big, p => fnt(st.titleFont, p), 56, pw); x.fillText(big, W / 2, H - 92);
    x.fillStyle = sub; x.font = mono(700, 15); x.fillText(`${now.getFullYear()}.${p2(now.getMonth() + 1)}.${p2(now.getDate())}`, W / 2, H - 48);
  }

  return c.toDataURL('image/png');
}
async function baseStrip() {
  await document.fonts.load('700 40px Fredoka'); await document.fonts.load(fnt(st.titleFont, 40), 'Aa');
  if (st.format === 'story') return storyStrip();
  if (st.frame !== 'classic') return designStrip();
  if (curLayout()) return composeBoard(curLayout());
  const T = tpl(), n = photos.length, head = 80, foot = 80, pad = 36, gap = 22;
  const pw = T ? T.pw : 520, ph = Math.round(pw / (T ? T.ratio : 1.03));
  const cw = T ? pad * 2 + pw * 2 + 24 : pad * 2 + pw;
  const c = document.createElement('canvas');
  c.width = cw; c.height = head + n * ph + (n - 1) * gap + foot;
  const x = c.getContext('2d');
  x.fillStyle = st.bgColor; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#2b2640'; x.lineWidth = 12; x.strokeRect(0, 0, c.width, c.height);
  x.fillStyle = '#2b2640'; x.textAlign = 'center';
  const ttl = st.titleText || (T ? T.title : 'Shangkoy Photobooth');
  let tfs = 38; x.font = fnt(st.titleFont, tfs);
  const tmax = c.width - 2 * (pad + 50), tw = x.measureText(ttl).width;
  if (tw > tmax) { tfs = Math.floor(tfs * tmax / tw); x.font = fnt(st.titleFont, tfs); }
  x.fillText(ttl, c.width / 2, 52);
  x.fillStyle = '#f44d6a'; x.font = '30px sans-serif';
  x.fillText('✦', pad + 14, 50); x.fillText('✦', c.width - pad - 14, 50);
  x.fillStyle = '#2b2640'; x.lineJoin = 'round';
  const imgs = await Promise.all(photos.map(loadImg));
  const refs = T ? await Promise.all(T.poses.slice(0, n).map(loadImg)) : [];
  imgs.forEach((im, i) => {
    const y = head + i * (ph + gap);
    drawCover(x, im, pad, y, pw, ph); x.lineWidth = 6; x.strokeRect(pad, y, pw, ph);
    if (T) {
      const rx = pad + pw + 24;
      drawCover(x, refs[i], rx, y, pw, ph); x.strokeRect(rx, y, pw, ph);
      if (T.labels) {
        x.font = '700 18px "Space Mono", monospace'; x.textAlign = 'left';
        const label = T.labels[i].toUpperCase(), lw = x.measureText(label).width + 28;
        x.fillStyle = '#f44d6a'; rr(x, rx + 12, y + 12, lw, 32, 16); x.fill(); x.lineWidth = 4; x.stroke();
        x.fillStyle = '#fff'; x.fillText(label, rx + 26, y + 34); x.textAlign = 'center'; x.fillStyle = '#2b2640';
      }
    }
  });
  x.font = '500 22px Fredoka, sans-serif';
  x.fillText('Made with good energy · ' + new Date().toLocaleDateString(), c.width / 2, c.height - 30);
  return c.toDataURL('image/png');
}

// ----- edit step: title, stickers and text with drag-to-place, shown after the photos are taken -----
const EMOJIS = ['⭐', '❤️', '⚡', '🌸', '✨', '🔥', '😎', '🥳', '👑', '🎀', '🌈', '💖', '🎉', '🦄', '🍓', '🐱', '😂', '💯', '🎵', '☁️'];
const TXT_COLORS = ['#ffffff', '#2b2640', '#f44d6a', '#ffd04a', '#67d6e0', '#6757d9'];
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
let ovl = [], selId = null, ovlUid = 0, buildSeq = 0, editTimer = 0, editFinish = null, editAbort = null;
const FONTS = [
  { k: 'Fredoka', w: 700, fb: 'sans-serif' }, { k: 'Pacifico', w: 400, fb: 'cursive' }, { k: 'Bangers', w: 400, fb: 'cursive' },
  { k: 'Lobster', w: 400, fb: 'cursive' }, { k: 'Permanent Marker', w: 400, fb: 'cursive' }, { k: 'Caveat', w: 700, fb: 'cursive' },
  { k: 'Playfair Display', w: 700, fb: 'serif' }, { k: 'Space Mono', w: 700, fb: 'monospace' }
];
function fnt(key, px) { const f = FONTS.find(v => v.k === key) || FONTS[0]; return `${f.w} ${px}px "${f.k}", ${f.fb}`; }
const fontBtns = () => FONTS.map(f => `<button type="button" data-f="${f.k}" style="font:${f.w} 15px '${f.k}',${f.fb}">${f.k}</button>`).join('');
function markFmt() {
  [...$('editFmt').children].forEach(b => b.classList.toggle('on', b.dataset.f === st.format));
  $('editStyleBox').hidden = st.format === 'story';
  $('editFrameBox').hidden = st.format !== 'strip';
  [...$('editFrame').children].forEach(b => b.classList.toggle('on', b.dataset.f === st.frame));
}
function markFonts() {
  [...$('editTitleFont').children].forEach(b => b.classList.toggle('on', b.dataset.f === st.titleFont));
  const o = ovl.find(v => v.id === selId);
  [...$('selFont').children].forEach(b => b.classList.toggle('on', !!o && b.dataset.f === (o.font || 'Fredoka')));
}
const BG_COLORS = ['#ffd04a', '#ffffff', '#f44d6a', '#ff9fb0', '#67d6e0', '#8fd3ff', '#b9f0a8', '#d9b3e6', '#6757d9', '#2b2640'];
function markBg() { [...$('editBg').children].forEach(b => b.classList.toggle('on', b.dataset.c === st.bgColor)); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const defaultTitle = () => curLayout() ? 'SHANGKOY PHOTOBOOTH' : (tpl() ? tpl().title : 'Shangkoy Photobooth');
function resetEdits() { ovl = []; selId = null; st.titleText = ''; st.bgColor = '#ffd04a'; st.titleFont = 'Fredoka'; st.format = 'strip'; st.frame = 'classic'; markBg(); markFmt(); }

$('editStk').innerHTML = EMOJIS.map(e => `<button type="button" data-e="${e}" aria-label="Add ${e}">${e}</button>`).join('');
const OUT_COLORS = ['', '#2b2640', '#ffffff', '#f44d6a', '#ffd04a', '#67d6e0', '#6757d9'];
const TBG_COLORS = ['', '#bff0f3', '#fff6d6', '#ffffff', '#2b2640', '#f44d6a', '#ffd04a', '#d9b3e6'];
const swBtns = (list, what) => list.map(c => c ? `<button type="button" data-c="${c}" style="background:${c}" aria-label="${what} ${c}"></button>` : `<button type="button" data-c="" class="nosw" aria-label="${what} none"></button>`).join('');
const markSw = (el, val) => [...el.children].forEach(b => b.classList.toggle('on', b.dataset.c === val));
$('editStroke').innerHTML = swBtns(OUT_COLORS, 'Text outline'); $('editTbg').innerHTML = swBtns(TBG_COLORS, 'Text background');
$('editStroke').onclick = e => { const b = e.target.closest('button'), o = ovl.find(v => v.id === selId); if (!b || !o) return; o.stroke = b.dataset.c; renderLayer(); };
$('editTbg').onclick = e => { const b = e.target.closest('button'), o = ovl.find(v => v.id === selId); if (!b || !o) return; o.bg = b.dataset.c; renderLayer(); };
$('editColors').innerHTML = TXT_COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="Text color ${c}"></button>`).join('');
$('editTitleFont').innerHTML = fontBtns(); $('selFont').innerHTML = fontBtns();
$('editTitleFont').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.titleFont = b.dataset.f; markFonts(); rebuildBase(); };
$('selFont').onclick = e => { const b = e.target.closest('button'), o = ovl.find(v => v.id === selId); if (!b || !o) return; o.font = b.dataset.f; renderLayer(); };
$('editFmt').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.format = b.dataset.f; markFmt(); rebuildBase(); };
// ---- Locked features: the frame designs and "Create own" need a code (a simple gate, kept until the tab is closed) ----
const UNLOCK_CODE = '1432', FREE_TAKES = 5;
const takesUsed = () => { try { return +localStorage.getItem('sk_takes') || 0; } catch (_) { return takesMem; } };
let takesMem = 0;
function bumpTakes() { takesMem++; try { localStorage.setItem('sk_takes', String(takesUsed() + 1)); } catch (_) {} updateTakes(); }
function updateTakes() {
  const left = Math.max(0, FREE_TAKES - takesUsed()), snap = $('snap');
  $('takeLbl').textContent = unlocked ? 'Unlimited takes' : left ? `${left} of ${FREE_TAKES} free takes left` : 'Free takes used up';
  snap.classList.toggle('locked', !unlocked && left === 0);
}
let unlocked = false, lockThen = null, lockCancel = null;
try { unlocked = sessionStorage.getItem('sk_unlocked') === '1'; } catch (_) {}
function markLocks() { updateTakes(); document.querySelectorAll('#editFrame button:not([data-f="classic"]), .tpl[data-t="custom"]').forEach(b => b.classList.toggle('locked', !unlocked)); }
function needUnlock(then, cancel, msg) {
  if (unlocked) return then();
  lockThen = then; lockCancel = cancel || null;
  $('lockNote').textContent = msg || 'Enter the code to unlock this feature.';
  $('lockInput').value = ''; $('lockErr').hidden = true; $('lockDlg').showModal(); $('lockInput').focus();
}
function tryUnlock() {
  if ($('lockInput').value.trim() === UNLOCK_CODE) {
    unlocked = true; try { sessionStorage.setItem('sk_unlocked', '1'); } catch (_) {}
    markLocks(); const go = lockThen; lockThen = lockCancel = null; $('lockDlg').close(); if (go) go();
  } else { $('lockErr').hidden = false; $('lockInput').select(); }
}
$('lockOk').onclick = tryUnlock;
$('lockInput').onkeydown = e => { if (e.key === 'Enter') tryUnlock(); };
$('lockCancel').onclick = $('lockX').onclick = () => $('lockDlg').close();
$('lockDlg').addEventListener('close', () => { const c = lockCancel; lockThen = lockCancel = null; if (c) c(); });
markLocks();
$('editFrame').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; const key = b.dataset.f;
  const apply = () => { st.frame = key; st.bgColor = FRAME_BG[key]; markBg(); markFmt(); rebuildBase(); };
  if (key === 'classic') apply(); else needUnlock(apply);
};
$('editBg').innerHTML = BG_COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="Strip color ${c}"></button>`).join('');
$('editBg').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.bgColor = b.dataset.c; markBg(); rebuildBase(); };

function fitLayer() {
  const sw = $('editStage').clientWidth;
  [...$('editLayer').children].forEach(d => { const o = ovl.find(v => v.id === +d.dataset.id); if (o) d.style.fontSize = (o.s * sw) + 'px'; });
}
function placeEl(d, o) {
  d.style.left = o.x * 100 + '%'; d.style.top = o.y * 100 + '%';
  d.style.transform = `translate(-50%,-50%) rotate(${o.r}deg)`;
}
function renderLayer() {
  const layer = $('editLayer'); layer.innerHTML = '';
  ovl.forEach(o => {
    const d = document.createElement('div');
    d.className = 'ov ' + o.type + (o.id === selId ? ' sel' : ''); d.dataset.id = o.id; d.textContent = o.v;
    if (o.type === 'text') { d.style.color = o.color; const f = FONTS.find(v => v.k === o.font) || FONTS[0]; d.style.fontFamily = `"${f.k}", ${f.fb}`; d.style.fontWeight = f.w;
      d.style.webkitTextStroke = o.stroke ? '.14em ' + o.stroke : '0';
      if (o.bg) { d.style.background = o.bg; d.style.padding = '.15em .35em'; d.style.borderRadius = '.2em'; } }
    placeEl(d, o); layer.appendChild(d);
  });
  fitLayer(); syncPanel();
}
function select(id) {
  selId = id;
  [...$('editLayer').children].forEach(d => d.classList.toggle('sel', +d.dataset.id === id));
  syncPanel();
}
function syncPanel() {
  const o = ovl.find(v => v.id === selId);
  $('editSel').hidden = !o; $('editHint').hidden = !!o;
  if (!o) return;
  $('selTextRow').hidden = o.type !== 'text';
  if (o.type === 'text' && document.activeElement !== $('selText')) $('selText').value = o.v;
  $('selSize').value = Math.round(o.s * 100); $('selRot').value = o.r;
  $('editColors').hidden = o.type !== 'text';
  [...$('editColors').children].forEach(b => b.classList.toggle('on', b.dataset.c === o.color));
  $('selFont').hidden = o.type !== 'text'; markFonts();
  $('selTextStyle').hidden = o.type !== 'text'; markSw($('editStroke'), o.stroke || ''); markSw($('editTbg'), o.bg || '');
}
function addOverlay(type, v) {
  const n = ovl.length, o = { id: ++ovlUid, type, v, x: clamp(.5 + ((n % 3) - 1) * .12, .1, .9), y: clamp(.4 + (n % 4) * .1, .1, .9), s: type === 'text' ? .09 : .18, r: 0, color: '#ffffff', font: 'Fredoka', stroke: '#2b2640', bg: '' };
  ovl.push(o); selId = o.id; renderLayer(); SFX.pop();
  return o;
}
$('editStk').onclick = e => { const b = e.target.closest('button'); if (b) addOverlay('emoji', b.dataset.e); };
$('editAddText').onclick = () => { addOverlay('text', 'Text'); $('selText').focus(); $('selText').select(); };
$('selText').oninput = e => {
  const o = ovl.find(v => v.id === selId); if (!o) return;
  o.v = e.target.value || ' ';
  const d = $('editLayer').querySelector(`[data-id="${o.id}"]`); if (d) d.textContent = o.v;
};
$('editColors').onclick = e => { const b = e.target.closest('button'); const o = ovl.find(v => v.id === selId); if (!b || !o) return; o.color = b.dataset.c; renderLayer(); };
$('selSize').oninput = e => { const o = ovl.find(v => v.id === selId); if (o) { o.s = +e.target.value / 100; fitLayer(); } };
$('selRot').oninput = e => { const o = ovl.find(v => v.id === selId); if (!o) return; o.r = +e.target.value; const d = $('editLayer').querySelector(`[data-id="${o.id}"]`); if (d) placeEl(d, o); };
function deleteSel() { if (selId == null) return; ovl = ovl.filter(v => v.id !== selId); selId = null; renderLayer(); SFX.delete(); }
$('selDel').onclick = deleteSel;
document.addEventListener('keydown', e => {
  if ($('editDlg').open && (e.key === 'Delete' || e.key === 'Backspace') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); deleteSel(); }
});

// drag to place (mouse, touch and pen)
$('editStage').addEventListener('pointerdown', e => {
  const d = e.target.closest('.ov');
  if (!d) return select(null);
  e.preventDefault(); select(+d.dataset.id);
  const o = ovl.find(v => v.id === selId), r = $('editStage').getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ox = o.x, oy = o.y;
  d.setPointerCapture(e.pointerId); d.classList.add('drag');
  const mv = ev => { o.x = clamp(ox + (ev.clientX - sx) / r.width, 0, 1); o.y = clamp(oy + (ev.clientY - sy) / r.height, 0, 1); placeEl(d, o); };
  const up = () => { d.classList.remove('drag'); d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); };
  d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
});
if (window.ResizeObserver) new ResizeObserver(fitLayer).observe($('editStage'));
$('editImg').addEventListener('load', () => { const i = $('editImg'); if (i.naturalHeight) $('editStage').style.setProperty('--ar', i.naturalWidth / i.naturalHeight); fitLayer(); });

async function rebuildBase() {
  const my = ++buildSeq, url = await composeStrip(true);
  if (my === buildSeq) $('editImg').src = url;
}
$('editTitle').oninput = e => {
  const v = e.target.value.trim(); st.titleText = v && v !== defaultTitle() ? v : '';
  clearTimeout(editTimer); editTimer = setTimeout(rebuildBase, 220);
};
$('editClear').onclick = () => {
  ovl = []; selId = null; st.titleText = ''; st.bgColor = '#ffd04a'; st.titleFont = 'Fredoka'; st.format = 'strip'; st.frame = 'classic'; markBg(); markFonts(); markFmt(); $('editTitle').value = defaultTitle();
  renderLayer(); rebuildBase(); SFX.delete();
};
$('editDlg').addEventListener('cancel', e => e.preventDefault());   // Esc would lose the strip, so use the buttons
$('editRestart').onclick = () => {
  clearTimeout(editTimer); $('editDlg').close(); const a = editAbort; editFinish = null; editAbort = null;
  photos = []; resetEdits(); renderSlots(); updateBtns(); say('Ready when you are.');
  if (a) a();
};
$('editDone').onclick = () => { clearTimeout(editTimer); $('editDlg').close(); const f = editFinish; editFinish = null; if (f) f(); };
function openEditor() {
  return new Promise(async (ok, no) => {
    try {
      editFinish = ok; editAbort = () => no(new Error('restart')); select(null);
      $('editTitle').value = st.titleText || defaultTitle(); markBg(); markFonts(); markFmt();
      $('editImg').src = await composeStrip(true);
      renderLayer(); $('editDlg').showModal(); fitLayer();
    } catch (e) { editFinish = null; editAbort = null; no(e); }
  });
}

// composeStrip(true) = clean strip for the editor; default = strip with the stickers/text drawn on top
function drawOverlays(x, cw, ch) {
  ovl.forEach(o => {
    const px = o.s * cw;
    x.save(); x.translate(o.x * cw, o.y * ch); x.rotate(o.r * Math.PI / 180); x.textAlign = 'center'; x.textBaseline = 'middle';
    if (o.type === 'text') {
      x.font = fnt(o.font, px); x.lineJoin = 'round';
      if (o.bg) {
        const m = x.measureText(o.v).width, ph = px * .35, pv = px * .15;
        x.fillStyle = o.bg; rr(x, -m / 2 - ph, -px / 2 - pv, m + 2 * ph, px + 2 * pv, px * .2); x.fill();
      }
      if (o.stroke) { x.lineWidth = px * .14; x.strokeStyle = o.stroke; x.strokeText(o.v, 0, 0); }
      x.fillStyle = o.color; x.fillText(o.v, 0, 0);
    } else { x.font = `${px}px ${EMOJI_FONT}`; x.fillText(o.v, 0, 0); }
    x.restore();
  });
}
async function composeStrip(raw) {
  const url = await baseStrip();
  if (raw || !ovl.length) return url;
  await Promise.all(ovl.filter(o => o.type === 'text').map(o => document.fonts.load(fnt(o.font, 40), o.v)));
  const im = await loadImg(url), c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0); drawOverlays(x, c.width, c.height);
  return c.toDataURL('image/png');
}

async function downloadData(data) {
  const a = document.createElement('a');
  a.href = data; a.download = 'shangkoy-photobooth-strip.png'; a.click();
}
$('download').onclick = async () => downloadData(await composeStrip());
$('retake').onclick = () => { photos = []; resetEdits(); renderSlots(); updateBtns(); say('Ready when you are.'); };

$('qrClose').onclick = () => $('qrDlg').close();
// Shrink the strip before uploading (a few hundred KB instead of several MB) so the link is made fast
async function smallJpeg(dataUrl) {
  try {
    const im = await loadImg(dataUrl), k = Math.min(1, 1080 / im.width);
    const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .88);
  } catch (_) { return dataUrl; }
}
async function showQR(src) {
  const box = $('qrBox'), note = $('qrNote');
  box.innerHTML = ''; note.textContent = 'Making your link…'; $('qrDlg').showModal();
  try {
    const res = await fetch('api/save.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: await smallJpeg(typeof src === 'function' ? await src() : src) }) });
    const raw = await res.text(); let d;
    try { d = JSON.parse(raw); } catch (_) { throw new Error(res.status === 404 ? 'api/save.php was not found (404)' : 'the server did not answer with JSON, PHP may not be running (HTTP ' + res.status + ')'); }
    if (!d.ok) throw new Error(d.error || 'server error');
    // d.url = public link (works on any phone); otherwise fall back to this site's own download link
    const url = d.url || (PUBLIC_BASE || location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')) + 'api/download.php?f=' + d.file;
    const isLocal = !d.url && /^(localhost|127\.|\[::1\])/.test(new URL(url).hostname);
    if (isLocal) throw new Error('the public link could not be made (' + (d.why || 'unknown reason') + '). A phone cannot open a localhost link. Fix that, or set PUBLIC_BASE to your computer\'s network address in js/script.js');
    new QRCode(box, { text: url, width: 220, height: 220, colorDark: '#2b2640', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    note.textContent = d.url
      ? 'Scan with your phone camera. Your strip opens: tap and hold it, then choose Save image. Link expires in 1 hour.'
      : 'Scan with your phone camera (same Wi-Fi as this computer). Your photo strip downloads automatically.';
  } catch (e) {
    note.textContent = 'Could not make the link: ' + (e && e.message ? e.message : 'unknown error') + '.';
  }
};

// ----- fullscreen: camera + strip fill the screen -----
const booth = $('booth');
const ICON_ON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Fullscreen</span>';
const ICON_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg><span>Exit</span>';
$('fsBtn').innerHTML = ICON_ON;
function setFS(on) {
  booth.classList.toggle('fs', on);
  document.body.style.overflow = on ? 'hidden' : '';
  $('fsBtn').innerHTML = on ? ICON_OFF : ICON_ON;
  $('fsBtn').setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
  requestAnimationFrame(() => { fitStrip(); setTimeout(fitStrip, 150); });
}
$('fsBtn').onclick = async () => {
  const on = !booth.classList.contains('fs');
  setFS(on);                                     // works everywhere (also phones without the Fullscreen API)
  try {
    if (on) await (booth.requestFullscreen || booth.webkitRequestFullscreen)?.call(booth);
    else if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } catch (e) {}
};
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && booth.classList.contains('fs')) setFS(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && booth.classList.contains('fs')) setFS(false); });

$('qrBtn').onclick = () => showQR(composeStrip);

// ----- history (kept in this browser with IndexedDB) -----
const HIST_MAX = 10;
const DB = {
  open: () => new Promise((ok, no) => {
    const r = indexedDB.open('photobooth', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('strips', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }),
  async all() {
    const db = await this.open();
    return new Promise((ok, no) => { const q = db.transaction('strips').objectStore('strips').getAll(); q.onsuccess = () => ok(q.result.reverse()); q.onerror = () => no(q.error); });
  },
  async put(fn) {
    const db = await this.open();
    return new Promise((ok, no) => { const t = db.transaction('strips', 'readwrite'); fn(t.objectStore('strips')); t.oncomplete = ok; t.onerror = () => no(t.error); });
  }
};
let mem = [];                                    // fallback if the browser blocks IndexedDB
async function saveHistory(full) {
  let thumb = full;
  try {
    const im = await loadImg(full), c = document.createElement('canvas');
    c.height = 200; c.width = Math.round(im.width * 200 / im.height);
    const tx = c.getContext('2d'); tx.fillStyle = '#fff6d6'; tx.fillRect(0, 0, c.width, c.height); tx.drawImage(im, 0, 0, c.width, c.height);
    thumb = c.toDataURL('image/jpeg', .8);
  } catch (e) {}
  const item = { ts: Date.now(), full, thumb };
  try {
    await DB.put(st => st.add(item));
    const all = await DB.all();
    if (all.length > HIST_MAX) await DB.put(st => all.slice(HIST_MAX).forEach(x => st.delete(x.id)));
  } catch (e) { mem.unshift({ ...item, id: Date.now() }); mem = mem.slice(0, HIST_MAX); }
}

// ----- pop-ups: strip ready, recent strips gallery, view strip -----
let histItems = [], curStrip = '', viewIdx = 0;
async function loadHist() {
  try { histItems = await DB.all(); } catch (e) { histItems = []; }
  if (!histItems.length) histItems = mem.slice();
}
function thumbs(box, max) {
  box.innerHTML = '';
  if (!histItems.length) { box.innerHTML = '<p class="histempty">No strips yet. Finish a photo session and it shows up here.</p>'; return; }
  histItems.slice(0, max || 99).forEach((it, i) => {
    const b = document.createElement('button'); b.style.setProperty('--i', i);
    b.type = 'button'; b.title = new Date(it.ts).toLocaleString();
    b.innerHTML = `<img src="${it.thumb}" alt="Saved strip ${i + 1}">`;
    b.onclick = () => openView(i);
    box.appendChild(b);
  });
}
async function refreshHist() {
  await loadHist();
  thumbs($('histList')); thumbs($('histGrid')); thumbs($('recentList'), 8);
  $('histBtn').textContent = histItems.length ? `Recent strips (${histItems.length})` : 'Recent strips';
}

function openDone(data) {
  curStrip = data; $('doneImg').src = data; refreshHist();
  if (!$('doneDlg').open) $('doneDlg').showModal();
}
function openView(i) {
  viewIdx = Math.max(0, Math.min(i, histItems.length - 1));
  const it = histItems[viewIdx]; if (!it) return;
  $('viewDlg').classList.remove('zoom'); $('viewImg').src = it.full;
  $('viewDate').textContent = `${new Date(it.ts).toLocaleString()} · ${viewIdx + 1} of ${histItems.length}`;
  $('vPrev').disabled = viewIdx === 0; $('vNext').disabled = viewIdx === histItems.length - 1;
  if (!$('viewDlg').open) { $('viewDlg').showModal(); SFX.pop(); }
}
$('vPrev').onclick = () => openView(viewIdx - 1);
$('vNext').onclick = () => openView(viewIdx + 1);
$('vDownload').onclick = () => downloadData(histItems[viewIdx].full);
$('vQr').onclick = () => showQR(histItems[viewIdx].full);
$('vDelete').onclick = async () => {
  const it = histItems[viewIdx]; if (!it) return;
  try { await DB.put(st => st.delete(it.id)); } catch (e) {}
  mem = mem.filter(x => x.id !== it.id);
  await refreshHist();
  if (!histItems.length) $('viewDlg').close(); else openView(viewIdx);
};
async function clearHist() { try { await DB.put(st => st.clear()); } catch (e) {} mem = []; await refreshHist(); $('viewDlg').close(); }
$('histClear').onclick = clearHist; $('gClear').onclick = clearHist;

['doneDlg', 'histDlg', 'viewDlg'].forEach(id => $(id).addEventListener('click', e => { if (e.target === $(id)) $(id).close(); }));
$('doneX').onclick = () => $('doneDlg').close();
$('histX').onclick = () => $('histDlg').close();
$('viewX').onclick = () => $('viewDlg').close();
$('mRetake').onclick = () => { $('doneDlg').close(); $('retake').click(); };
$('mDownload').onclick = () => downloadData(curStrip);
$('mQr').onclick = () => showQR(curStrip);
$('histBtn').onclick = async () => { await refreshHist(); $('histDlg').showModal(); };
$('recentAll').onclick = $('histBtn').onclick;
refreshHist();   // show saved strips as soon as the page opens
$('viewImg').onclick = () => $('viewDlg').classList.toggle('zoom');

// sound on/off button
const SND_ON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg><span>Sound</span>';
const SND_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg><span>Muted</span>';
function paintSnd() { $('sndBtn').innerHTML = SFX.on ? SND_ON : SND_OFF; $('sndBtn').setAttribute('aria-label', SFX.on ? 'Sound on' : 'Sound off'); }
$('sndBtn').onclick = () => { SFX.set(!SFX.on); paintSnd(); if (SFX.on) SFX.pop(); };
paintSnd();