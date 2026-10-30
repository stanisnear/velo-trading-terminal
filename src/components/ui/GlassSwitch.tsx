import React from 'react';
import './GlassSwitch.css';
/** A real checkbox retains keyboard, label and form behavior beneath its fluid thumb. */
export function GlassSwitch({checked,onChange,label,disabled=false}:{checked:boolean;onChange:(checked:boolean)=>void;label:string;disabled?:boolean}){
 return <span className="velo-control-switch"><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={event=>onChange(event.currentTarget.checked)}/><span aria-hidden="true"><i><svg viewBox="0 0 14 14" fill="none"><path d="m3 7 2.5 2.5L11 4"/></svg></i></span></span>;
}
