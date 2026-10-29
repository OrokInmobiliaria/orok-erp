import React,{useRef} from 'react';
import {Palette,X} from 'lucide-react';
import ThemePicker from './ThemePicker';
export default function AppearanceMenu(){
  const dialog=useRef(null);
  return <div className="appearance-menu no-print">
    <button type="button" className="nav-top" aria-haspopup="dialog" onClick={()=>dialog.current.showModal()}><Palette size={17} aria-hidden="true"/>Apariencia</button>
    <dialog ref={dialog} className="appearance-dialog" aria-label="Apariencia del ERP" onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}}}>
      <button type="button" autoFocus className="appearance-close orok-btn orok-btn-secondary" onClick={()=>dialog.current.close()} aria-label="Cerrar Apariencia"><X size={18}/>Cerrar</button>
      <ThemePicker/>
    </dialog>
  </div>;
}
