/** Restrained ink-bloom feedback. Decorative only: native events and handlers stay intact. */
export function mountPressFeedback(doc) {
  const view=doc.defaultView;
  if(!view)return()=>{};
  const effects=new Set();
  function press(event) {
    if(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches||event.repeat)return;
    if(event.type==='pointerdown'&&(event.button!==0||event.isPrimary===false))return;
    if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
    const target=event.target instanceof view.Element?event.target:null;
    const control=target?.closest('button,a[href]');
    if(!control||control.matches(':disabled,[aria-disabled="true"]')||target.closest('input,textarea,[contenteditable="true"]'))return;
    if(event.type==='keydown'&&event.key===' '&&control.tagName==='A')return;
    if(typeof control.animate!=='function')return;
    const bounds=control.getBoundingClientRect();
    if(bounds.width<12||bounds.height<12)return;
    const dialog=control.closest('dialog[open]');
    const parent=dialog||doc.body;
    if(!parent)return;
    const parentBounds=dialog?.getBoundingClientRect();
    const effect=doc.createElement('span');
    effect.className='velo-press-bloom';effect.setAttribute('aria-hidden','true');
    const x=event.type==='pointerdown'?Math.max(0,Math.min(bounds.width,event.clientX-bounds.left)):bounds.width/2;
    const y=event.type==='pointerdown'?Math.max(0,Math.min(bounds.height,event.clientY-bounds.top)):bounds.height/2;
    const color=view.getComputedStyle(control).borderRadius;
    Object.assign(effect.style,{
      position:dialog?'absolute':'fixed',pointerEvents:'none',zIndex:'2147483000',
      left:`${bounds.left-(parentBounds?.left||0)+(dialog?.scrollLeft||0)}px`,
      top:`${bounds.top-(parentBounds?.top||0)+(dialog?.scrollTop||0)}px`,
      width:`${bounds.width}px`,height:`${bounds.height}px`,borderRadius:color,
      background:`radial-gradient(ellipse at ${x}px ${y}px, color-mix(in srgb, var(--accent, #84ab92) 23%, transparent), transparent 78%)`,
      boxShadow:'inset 0 0 0 1px color-mix(in srgb, var(--accent, #84ab92) 30%, transparent)',
      transformOrigin:`${x}px ${y}px`,
    });
    parent.append(effect);effects.add(effect);
    while(effects.size>4){const oldest=effects.values().next().value;oldest.remove();effects.delete(oldest);}
    const animation=effect.animate([{opacity:0,transform:'scale(.88)'},{opacity:1,transform:'scale(1)',offset:.2},{opacity:0,transform:'scale(1.025)'}],{duration:330,easing:'cubic-bezier(.2,.7,.2,1)'});
    const remove=()=>{effect.remove();effects.delete(effect);};
    animation.finished.then(remove,remove);
  }
  doc.addEventListener('pointerdown',press,{passive:true});doc.addEventListener('keydown',press);
  return()=>{doc.removeEventListener('pointerdown',press);doc.removeEventListener('keydown',press);effects.forEach(effect=>effect.remove());effects.clear();};
}
