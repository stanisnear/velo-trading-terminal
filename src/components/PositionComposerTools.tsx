import React, { useState } from 'react';
import { Image, Layers, X } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { CompactPosition } from './SharedPositionCard';
import type { TradeShare } from '../utils/tradeShare';
export function PositionComposerTools({ choices, attachment, onChange, onPnl }: {
  choices: TradeShare[]; attachment: TradeShare | null; onChange: (data: TradeShare | null) => void; onPnl: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    {attachment && <div className="composer-position"><CompactPosition data={attachment}/><button type="button" className="remove-attachment" aria-label="Remove position attachment" onClick={()=>onChange(null)}><X size={14}/></button></div>}
    <div className="composer-share-tools"><button type="button" onClick={()=>setOpen(true)}><Layers size={14}/>Position</button><button type="button" onClick={onPnl}><Image size={14}/>PnL image</button></div>
    <Dialog open={open} onClose={()=>setOpen(false)} title="Attach a position"><div className="trade-share-body">
      <p className="trade-share-feedback">Add a compact live position to your post. Its status and PnL follow the position through settlement.</p>
      <div className="composer-position-list">{choices.map(data=><button type="button" key={`${data.contract}:${data.tradeId}`} onClick={()=>{onChange({...data,presentation:'position',updateMode:'live'});setOpen(false);}}><CompactPosition data={data}/><span>Attach position ↗</span></button>)}</div>
      {!choices.length && <p className="trade-share-feedback">You have no open positions to attach. Closed trades are available under PnL image.</p>}
    </div></Dialog>
  </>;
}
