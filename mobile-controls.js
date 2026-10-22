(() => {
  'use strict';
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
  const state = { enabled: mobile, x: 0, y: 0, block: false, actions: 0 };
  window.danjeeMobile = { state, read() {
    const value = JSON.stringify(state); state.actions = 0; return value;
  }};
  if (!mobile) return;
  document.documentElement.classList.add('mobile-controls');
  let meta = document.querySelector('meta[name=viewport]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.append(meta); }
  meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  const canvas = document.querySelector('#unity-canvas');
  const hud = document.createElement('div'); hud.id = 'mobile-hud';
  hud.innerHTML = `<div id="mobile-actions" aria-label="Боевое управление">
    <button data-action="1" class="attack" aria-label="Удар">⚔<small>Удар</small></button>
    <button data-action="2" class="kick" aria-label="Пинок">➤<small>Пинок</small></button>
    <button data-block class="block" aria-label="Блок" aria-pressed="false">◈<small>Блок</small></button>
    <button data-action="4" class="dodge" aria-label="Уклонение">↝<small>Додж</small></button>
    <button data-action="8" class="super-one" aria-label="Супер удар 1">✦<small>Супер I</small></button>
    <button data-action="16" class="super-two" aria-label="Супер удар 2">✹<small>Супер II</small></button>
  </div><div id="mobile-stick" hidden><i></i></div>`;
  document.body.append(hud);
  let ready = false, stickId = null, origin, blockId = null, blockStart = 0, latched = false;
  const stick = hud.querySelector('#mobile-stick'), knob = stick.firstElementChild;
  const block = hud.querySelector('[data-block]');
  function updateBlock() {
    state.block = latched || blockId !== null;
    block.setAttribute('aria-pressed', String(state.block));
  }
  function stopStick() { stickId = null; state.x = state.y = 0; stick.hidden = true; }
  function reset() {
    stopStick(); blockId = null; latched = false; state.actions = 0; updateBlock();
    hud.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed'));
  }
  window.danjeeMobile.setReady = () => { ready = true; hud.classList.add('ready'); };
  // Reserve the Unity room panel and potion button; touches there remain native UI input.
  function overNativeUI(x, y) {
    const r = canvas.getBoundingClientRect(), sx = canvas.width / r.width, sy = canvas.height / r.height;
    x = (x-r.left)*sx; y = (y-r.top)*sy;
    const scale = Math.max(.65, Math.min(1.2, canvas.width/960, canvas.height/600));
    const resourceScale = Math.max(.65, canvas.height/1080);
    return (x < 202*scale && y < 300*scale) ||
      (x < 130*resourceScale && Math.abs(y-canvas.height*.5) < 55*resourceScale);
  }
  canvas.addEventListener('pointerdown', e => {
    if (!ready || e.pointerType === 'mouse' || stickId !== null || overNativeUI(e.clientX,e.clientY)) return;
    e.preventDefault(); stickId = e.pointerId; origin = {x:e.clientX,y:e.clientY};
    canvas.setPointerCapture(stickId); stick.hidden = false;
    stick.style.left = `${origin.x}px`; stick.style.top = `${origin.y}px`;
    knob.style.transform = 'translate(0px,0px)';
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    const dx=e.clientX-origin.x, dy=e.clientY-origin.y, radius=48;
    const length=Math.hypot(dx,dy), ratio=Math.min(1,radius/Math.max(1,length));
    const magnitude=Math.max(0,Math.min(1,(length-7)/(radius-7)));
    state.x=length ? dx/length*magnitude : 0; state.y=length ? -dy/length*magnitude : 0;
    knob.style.transform=`translate(${dx*ratio}px,${dy*ratio}px)`;
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture'])
    canvas.addEventListener(type,e=>{if(e.pointerId===stickId)stopStick();});
  for (const button of hud.querySelectorAll('button')) {
    button.addEventListener('pointerdown',e=>{
      e.preventDefault(); e.stopPropagation(); if(!ready) return;
      button.setPointerCapture(e.pointerId); button.classList.add('pressed');
      if(button===block) {
        if(blockId!==null)return;
        blockId=e.pointerId; blockStart=performance.now(); updateBlock();
      } else state.actions |= Number(button.dataset.action);
    });
    function release(e) {
      e.preventDefault(); button.classList.remove('pressed');
      if(button===block && blockId===e.pointerId) {
        // A tap toggles; a deliberate hold always ends on release.
        latched=e.type==='pointerup' && performance.now()-blockStart<250 ? !latched : false;
        blockId=null; updateBlock();
      }
    }
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
    button.addEventListener('contextmenu',e=>e.preventDefault());
  }
  window.addEventListener('blur',reset); window.addEventListener('resize',reset);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
})();
