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
    <button data-action="8" class="super-one" aria-label="Круговой удар"><img data-icon="CircularStrike" alt="" draggable="false"><small>Круговой</small></button>
    <button data-action="16" class="super-two" aria-label="Сильный удар"><img data-icon="HeavyStrike" alt="" draggable="false"><small>Сильный</small></button>
    <button data-action="2" class="kick" aria-label="Пинок"><img data-icon="Kick" alt="" draggable="false"><small>Пинок</small></button>
    <button data-block class="block" aria-label="Парирование: удерживайте кнопку" aria-pressed="false"><img data-icon="Guard" alt="" draggable="false"><small>Парирование</small></button>
    <button data-action="4" class="dodge" aria-label="Уклонение"><img data-icon="Dodge" alt="" draggable="false"><small>Уклон</small></button>
  </div><div id="mobile-move-hint"><span>◎</span>Движение</div>
  <div id="mobile-tap-hint"><img data-icon="Attack" id="mobile-attack-icon" alt="" draggable="false">Коснись поля — удар</div>
  <div id="mobile-stick" hidden><i></i></div><div id="mobile-tap-feedback" hidden></div>`;
  document.body.append(hud);
  function setIcon(image,id) {
    if(!image||!id||!/^[A-Za-z]+$/.test(id))return;
    const url='action-icons/'+id+'.png?v='+(window.danjeeActionIconVersion||'1');
    if(image.dataset.source===url)return;
    image.dataset.icon=id;image.dataset.source=url;image.src=url;
  }
  hud.querySelectorAll('[data-icon]').forEach(image=>setIcon(image,image.dataset.icon));
  window.danjeeMobile.setActionIcons = context => {
    setIcon(hud.querySelector('#mobile-attack-icon'),context.attack||'Attack');
    setIcon(hud.querySelector('[data-block] img'),context.guard||'Guard');
    const parry=hud.querySelector('[data-block]');
    const parryName=context.guard==='Riposte'?'Улучшенное парирование':'Парирование';
    if(parry.dataset.label!==parryName){parry.dataset.label=parryName;parry.querySelector('small').textContent=parryName;parry.setAttribute('aria-label',parryName+': удерживайте кнопку');}
    setIcon(hud.querySelector('[data-action="4"] img'),context.dodge||'Dodge');
  };
  let ready = false, combat = false, exclusions = [], stickId = null, blockId = null;
  const pointers = new Map(), captures = new Map();
  const stick = hud.querySelector('#mobile-stick'), knob = stick.firstElementChild;
  const block = hud.querySelector('[data-block]'), feedback = hud.querySelector('#mobile-tap-feedback');
  const TAP_SLOP = 10, TAP_MS = 300, RADIUS = 46;
  window.danjeeMobile.setCircularAvailable = available => {
    const circular = hud.querySelector('[data-action="8"]');
    circular.disabled = !available;
    circular.style.display = available ? '' : 'none';
    if (!available) state.actions &= ~8;
  };
  function active() { return ready && combat && !document.hidden; }
  function capture(element, id) { element.setPointerCapture(id); captures.set(id, element); }
  function releaseCapture(id) {
    const element = captures.get(id); captures.delete(id);
    if (element && element.hasPointerCapture(id)) element.releasePointerCapture(id);
  }
  function stopStick() { stickId = null; state.x = state.y = 0; stick.hidden = true; }
  function reset() {
    pointers.clear(); stopStick(); blockId = null; state.block = false; state.actions = 0;
    block.setAttribute('aria-pressed', 'false'); feedback.hidden = true;
    hud.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed'));
    for (const id of [...captures.keys()]) releaseCapture(id);
  }
  function sync() { hud.classList.toggle('ready', active()); }
  window.danjeeMobile.setReady = () => { ready = true; sync(); };
  // Actual UI rectangles arrive from Unity in normalized, top-left canvas coordinates.
  // Loading the player alone does not enable combat input in the guild.
  window.danjeeMobile.setContext = (enabled, areas) => {
    const changed = combat !== !!enabled; combat = !!enabled; exclusions = areas || [];
    if (changed) reset(); sync();
  };
  function overNativeUI(x, y) {
    const r = canvas.getBoundingClientRect();
    const px = (x-r.left)/r.width, py = (y-r.top)/r.height;
    return px < 0 || py < 0 || px > 1 || py > 1 ||
      exclusions.some(a => px >= a.x && py >= a.y && px <= a.x+a.w && py <= a.y+a.h);
  }
  canvas.addEventListener('pointerdown', e => {
    if (!active() || (e.pointerType === 'mouse' && e.button !== 0) || overNativeUI(e.clientX,e.clientY)) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY, time:performance.now(), dragged:false,
      canMove:e.clientX < r.left+r.width*.48 && e.clientY > r.top+r.height*.38});
    capture(canvas,e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    e.preventDefault();
    const dx=e.clientX-p.x, dy=e.clientY-p.y, length=Math.hypot(dx,dy);
    if (length > TAP_SLOP) p.dragged = true;
    if (p.dragged && p.canMove && stickId === null) {
      stickId=e.pointerId; stick.hidden=false; stick.style.left=`${p.x}px`; stick.style.top=`${p.y}px`;
    }
    if (e.pointerId !== stickId) return;
    const ratio=Math.min(1,RADIUS/Math.max(1,length));
    const magnitude=Math.max(0,Math.min(1,(length-TAP_SLOP)/(RADIUS-TAP_SLOP)));
    state.x=length ? dx/length*magnitude : 0; state.y=length ? -dy/length*magnitude : 0;
    knob.style.transform=`translate(${dx*ratio}px,${dy*ratio}px)`;
  });
  function endPointer(e) {
    const p=pointers.get(e.pointerId); if(!p)return;
    pointers.delete(e.pointerId);
    if (e.type==='pointerup' && active() && !p.dragged && performance.now()-p.time<=TAP_MS &&
        Math.hypot(e.clientX-p.x,e.clientY-p.y)<=TAP_SLOP && !overNativeUI(e.clientX,e.clientY)) {
      state.actions |= 1;
      feedback.hidden=false; feedback.style.left=`${e.clientX}px`; feedback.style.top=`${e.clientY}px`;
      feedback.getAnimations().forEach(a=>a.cancel());
      feedback.animate([{opacity:.9,transform:'scale(.5)'},{opacity:0,transform:'scale(1.6)'}],{duration:200,fill:'forwards'});
    }
    if(e.pointerId===stickId)stopStick();
    releaseCapture(e.pointerId);
  }
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,endPointer);
  for (const button of hud.querySelectorAll('button')) {
    button.addEventListener('pointerdown',e=>{
      e.preventDefault(); e.stopPropagation(); if(!active() || button.disabled)return;
      if(button===block && blockId!==null)return;
      capture(button,e.pointerId); button.classList.add('pressed');
      if(button===block) { blockId=e.pointerId; state.block=true; block.setAttribute('aria-pressed','true'); }
      else state.actions |= Number(button.dataset.action);
    });
    function release(e) {
      e.preventDefault(); button.classList.remove('pressed');
      if(button===block && blockId===e.pointerId) {
        blockId=null; state.block=false; block.setAttribute('aria-pressed','false');
      }
      releaseCapture(e.pointerId);
    }
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
    button.addEventListener('contextmenu',e=>e.preventDefault());
  }
  window.addEventListener('blur',reset); window.addEventListener('resize',reset);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();sync();});
})();
