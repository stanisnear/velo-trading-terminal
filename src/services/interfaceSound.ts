export type InterfaceSound = 'SUCCESS' | 'ERROR' | 'OPEN' | 'CLOSE' | 'CLICK';
const preference = 'velo.interfaceSounds';
export const soundPreferenceEvent = 'velo:interface-sounds';
export function interfaceSoundsEnabled() {
  try { return localStorage.getItem(preference) === 'on'; } catch { return false; }
}
export function setInterfaceSounds(enabled:boolean) {
  try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch { return; }
  window.dispatchEvent(new Event(soundPreferenceEvent));
}
let context:AudioContext|undefined;
let last = -Infinity;
/** Original short tones. One context, optional feedback, no effect on action state. */
export function playInterfaceSound(type:InterfaceSound) {
  if (!interfaceSoundsEnabled() || document.hidden) return;
  try {
    const Constructor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Constructor) return;
    const now = performance.now();
    if (now-last < 90) return; // Shared button + action callbacks may request the same cue.
    last=now;
    context ??= new Constructor();
    const ctx=context!;
    if (ctx.state === 'suspended') void ctx.resume().catch(()=>{});
    const oscillator=ctx.createOscillator(),gain=ctx.createGain();
    const [start,end,duration,volume] = type==='SUCCESS' ? [540,720,.18,.025] : type==='ERROR' ? [210,155,.16,.02] : type==='OPEN' ? [650,790,.11,.018] : type==='CLOSE' ? [520,390,.10,.016] : [920,880,.035,.009];
    oscillator.type='sine';oscillator.connect(gain);gain.connect(ctx.destination);
    oscillator.frequency.setValueAtTime(start,ctx.currentTime);oscillator.frequency.exponentialRampToValueAtTime(end,ctx.currentTime+duration);
    gain.gain.setValueAtTime(volume,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    oscillator.start();oscillator.stop(ctx.currentTime+duration);
  } catch { /* Sound never delays or rejects a user action. */ }
}
