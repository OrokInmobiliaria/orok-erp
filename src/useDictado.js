// R76 · Dictado por voz reutilizable: usa el reconocimiento del navegador (Chrome, Edge, Safari, Android) y, si no existe,
// graba hasta 1 minuto y lo transcribe en el servidor con el proveedor de L.O.L.A.
import {useRef, useState} from 'react';
import {api} from './dataService';
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export default function useDictado(onText) {
  const [escuchando, setEscuchando] = useState(false), [error, setError] = useState(''), [procesando, setProcesando] = useState(false);
  const rec = useRef(null), media = useRef(null);
  async function servidor() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError('Este navegador no permite dictar.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true}), chunks = [];
      const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, type ? {mimeType: type} : undefined); media.current = mr; setEscuchando(true);
      const tope = setTimeout(() => mr.state === 'recording' && mr.stop(), 60000);
      mr.ondataavailable = e => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        clearTimeout(tope); stream.getTracks().forEach(t => t.stop()); media.current = null; setEscuchando(false);
        const blob = new Blob(chunks, {type: mr.mimeType || type || 'audio/webm'}), buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        setProcesando(true);
        try { const r = await api.transcribeLolaAssistant({audio: btoa(bin), mime: blob.type}); if (r.text) onText(r.text); } catch (e) { setError(e.message); } finally { setProcesando(false); }
      };
      mr.start();
    } catch { setEscuchando(false); setError('No se pudo usar el micrófono. Revisa el permiso del navegador.'); }
  }
  function alternar() {
    setError('');
    if (escuchando) { rec.current?.stop?.(); media.current?.stop?.(); return; }
    if (!SR) { servidor(); return; }
    try {
      const r = new SR(); rec.current = r; r.lang = 'es-PE'; r.interimResults = false; r.continuous = true; let texto = '';
      r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) texto += (texto ? ' ' : '') + e.results[i][0].transcript.trim(); };
      r.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') setError(e.error === 'not-allowed' ? 'Permite el micrófono en el navegador.' : 'No se pudo reconocer la voz.'); };
      r.onend = () => { setEscuchando(false); rec.current = null; if (texto.trim()) onText(texto.trim()); };
      r.start(); setEscuchando(true);
    } catch { servidor(); }
  }
  return {escuchando, procesando, error, alternar, disponible: !!SR || (typeof window !== 'undefined' && !!window.MediaRecorder)};
}
