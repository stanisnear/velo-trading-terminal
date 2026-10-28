import React,{useSyncExternalStore} from 'react';
import {interfaceSoundsEnabled,setInterfaceSounds,soundPreferenceEvent,playInterfaceSound} from '../../services/interfaceSound';
function subscribe(callback:()=>void) {
  window.addEventListener(soundPreferenceEvent,callback);window.addEventListener('storage',callback);
  return ()=>{window.removeEventListener(soundPreferenceEvent,callback);window.removeEventListener('storage',callback);};
}
export function InterfaceSounds() {
  const enabled=useSyncExternalStore(subscribe,interfaceSoundsEnabled,()=>false);
  return <label className="velo-sound-preference"><span><strong>Interface sounds</strong><small>Subtle feedback for actions and confirmations.</small></span><input className="velo-switch" type="checkbox" role="switch" checked={enabled} onChange={event=>{const next=event.currentTarget.checked;setInterfaceSounds(next);if(next)playInterfaceSound('CLICK');}}/></label>;
}
