import {useEffect,useState} from 'react';
import {api} from './dataService';
const local=()=>({leads:['crm_sheet_url','crm_sheet_url_2','crm_sheet_url_3'].map(k=>localStorage.getItem(k)||''),units:localStorage.getItem('crm_units_sheet_url')||'',plansExt:localStorage.getItem('crm_plans_ext_url')||'',plansInt:localStorage.getItem('crm_plans_int_url')||'',finishes:'',separationTemplate:'',legalTemplatesFolder:'',separationFilesFolder:'',autoSync:true,revision:0});
const shared=settings=>settings.toolLinks||{...local(),finishes:settings.acabadosSheetUrl||'',separationTemplate:'',legalTemplatesFolder:'',separationFilesFolder:''};
export default function useToolLinks(settings){
 const [draft,setDraft]=useState(()=>shared(settings)),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const serial=JSON.stringify(settings.toolLinks||null);
 useEffect(()=>{if(!dirty)setDraft(shared(settings));},[serial,settings.acabadosSheetUrl]);
 const change=(key,value)=>{setDirty(true);setMessage('');setDraft(d=>({...d,[key]:value}));};
 const setLead=(index,value)=>{setDirty(true);setMessage('');setDraft(d=>({...d,leads:d.leads.map((url,i)=>i===index?value:url)}));};
 async function save(){
  setBusy(true);setMessage('');
  try{const result=await api.updateToolLinks(draft);setDraft(result);setDirty(false);setMessage('Enlaces guardados y compartidos con todos los usuarios.');return result;}catch(e){setMessage(e.message);throw e;}finally{setBusy(false);}
 }
 function recover(){const old=local();setDraft({...old,finishes:settings.acabadosSheetUrl||'',separationTemplate:settings.toolLinks?.separationTemplate||'',legalTemplatesFolder:settings.toolLinks?.legalTemplatesFolder||'',separationFilesFolder:settings.toolLinks?.separationFilesFolder||'',revision:settings.toolLinks?.revision||0});setDirty(true);setMessage('Enlaces recuperados de este navegador. Revisa y guarda para compartirlos.');}
 function reload(){setDraft(shared(settings));setDirty(false);setMessage('Versión compartida recuperada.');}
 return {draft,dirty,busy,message,change,setLead,save,recover,reload};
}
