'use strict';
// R62 · Íconos junto al chat de cada IA: 🎤 dicta en el chat (Evaluador/Contabilidad) y 📎 abre «Dictar o adjuntar».
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const w=fs.readFileSync(path.join(__dirname,'..','public','ia-rellenar.js'),'utf8');
test('íconos junto al chat y sin el botón grande del encabezado',()=>{
 for(const t of ["document.getElementById('aiSend')","'.lola-panel .lola-input'",'Dictar en el chat','Adjuntar o dictar para llenar esta pantalla',"abrir('adjuntar')","modo === 'mic'","$('archivos').click()",'ia-rellenar-icono'])assert.ok(w.includes(t),t);
 assert.ok(!w.includes("head.insertAdjacentElement('afterend', accion())"),'ya no se inserta la franja grande bajo el encabezado');
 assert.doesNotThrow(()=>new Function(w));
});
