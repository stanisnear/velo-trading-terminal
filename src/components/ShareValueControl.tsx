import React from 'react';
export function ShareValueControl({hidden,onChange,disabled=false}:{hidden:boolean;onChange:(hidden:boolean)=>void;disabled?:boolean}) {
  return <div className="share-value-control" role="group" aria-label="Visible position values"><button type="button" aria-pressed={!hidden} disabled={disabled} onClick={()=>onChange(false)}>$ Amounts</button><button type="button" aria-pressed={hidden} disabled={disabled} onClick={()=>onChange(true)}>% Return only</button></div>;
}
