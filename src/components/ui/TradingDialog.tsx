import React from 'react';
import { Dialog } from './Dialog';
import './TradingDialog.css';

/** One frame, type scale and scroll/footer behavior for trade inspection and management. */
export function TradingDialog({open,onClose,title,busy=false,identity,children,footer,className=''}:{
 open:boolean;onClose:()=>void;title:string;busy?:boolean;identity?:React.ReactNode;children:React.ReactNode;footer?:React.ReactNode;className?:string;
}){
 return <Dialog open={open} onClose={onClose} busy={busy} title={title} className={`trade-dialog ${className}`}>
  {identity&&<div className="trade-dialog-identity">{identity}</div>}
  <div className="trade-dialog-scroll custom-scrollbar">{children}</div>
  {footer&&<footer className="trade-dialog-actions">{footer}</footer>}
 </Dialog>;
}
