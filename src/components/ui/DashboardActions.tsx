import React,{useId,useState} from 'react';
import{motion,useReducedMotion}from'motion/react';
import{ArrowDownLeft,ArrowUpRight,Droplets,Send,Waypoints}from'lucide-react';
import{ActionContent,supportsProductMotion}from'./ProductMotion';
import'./DashboardActions.css';
type Action={label:string;Icon:typeof Send;run:()=>void;pending?:boolean};
export function DashboardActions({deposit,withdraw,faucet,send,bridge,claiming=false}:{deposit?:()=>void;withdraw?:()=>void;faucet?:()=>void;send?:()=>void;bridge?:()=>void;claiming?:boolean}){
 const[selected,setSelected]=useState<number|null>(null),id=useId(),reduced=useReducedMotion();
 const actions:Action[]=[...(deposit?[{label:'Deposit',Icon:ArrowDownLeft,run:deposit}]:[]),...(withdraw?[{label:'Withdraw',Icon:ArrowUpRight,run:withdraw}]:[]),...(faucet?[{label:'Faucet',Icon:Droplets,run:faucet,pending:claiming}]:[]),...(send?[{label:'Send',Icon:Send,run:send}]:[]),...(bridge?[{label:'Bridge',Icon:Waypoints,run:bridge}]:[])];
 return <div className="dashboard-action-dock" role="group" aria-label="Account actions" onPointerLeave={()=>setSelected(null)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setSelected(null);}}>{actions.map(({label,Icon,run,pending},index)=><button type="button" key={label} disabled={pending} data-primary={label==='Deposit'} onPointerEnter={event=>{if(event.pointerType==='mouse')setSelected(index);}} onFocus={()=>setSelected(index)} onClick={run} onKeyDown={event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const buttons=Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const current=buttons.indexOf(event.currentTarget),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}}>
  {selected===index&&!reduced&&supportsProductMotion()&&<motion.span className="dashboard-action-lens" layoutId={`${id}-action`} transition={{type:'spring',stiffness:440,damping:34}}/>}
  <ActionContent pending={!!pending} pendingLabel="Claiming"><Icon size={16}/><span>{label}</span></ActionContent>
 </button>)}</div>;
}
