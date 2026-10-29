import React from 'react';
import {interestScore, SCORE_NOTICE} from './leadScore.mjs';

const COLORS = {
  Alto: ['#166534', '#dcfce7'], Medio: ['#92400e', '#fef3c7'], Bajo: ['#475569', '#e2e8f0'],
};

// Insignia compacta para la tarjeta del tablero. No se muestra si el puntaje no aplica.
export function LeadScoreBadge({lead}) {
  const r = interestScore(lead);
  if (r.score === null) return null;
  const [fg, bg] = COLORS[r.band] || COLORS.Bajo;
  return <span title={'Interés ' + r.band + ' · ' + r.score + '/100'} aria-label={'Interés ' + r.band + ', ' + r.score + ' de 100'}
    style={{display:'inline-block',marginLeft:8,padding:'1px 8px',borderRadius:999,fontSize:11,fontWeight:700,color:fg,background:bg}}>{r.band} · {r.score}</span>;
}

// Panel con el detalle de motivos para la ficha del lead.
export function LeadScorePanel({lead}) {
  const r = interestScore(lead);
  if (r.score === null) return null;
  const [fg, bg] = COLORS[r.band] || COLORS.Bajo;
  return <details style={{marginTop:12,padding:12,border:'1px solid #e7dfd8',borderRadius:10,background:'#fffdfb'}}>
    <summary style={{cursor:'pointer',fontWeight:700}}>Puntaje de interés: <span style={{color:fg,background:bg,padding:'1px 8px',borderRadius:999}}>{r.band} · {r.score}/100</span></summary>
    <ul style={{margin:'10px 0 6px',paddingLeft:18,fontSize:13}}>{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
    <p style={{fontSize:12,color:'#57534e',margin:0}}>{SCORE_NOTICE}</p>
  </details>;
}
