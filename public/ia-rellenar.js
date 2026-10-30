/* R54 · «Dictar o adjuntar» — botón común a L.O.L.A (CRM), G.R.E.T.A (Marketing), M.O.R.A (Evaluador) y D.I.A.V.A (Contabilidad).
   Lee los campos visibles de la pantalla, envía lo dictado/escrito y las imágenes o PDF a la IA del módulo, muestra la
   propuesta campo por campo (actual → propuesto, fuente, confianza) y solo aplica lo que la persona marca. No guarda nada:
   después de aplicar, se guarda como siempre en esa pantalla. */
(function () {
  'use strict';
  if (window.__iaRellenar) return; window.__iaRellenar = true;
  var IAS = { lola: 'L.O.L.A', greta: 'G.R.E.T.A', mora: 'M.O.R.A', diava: 'D.I.A.V.A' };
  function modulo() {
    if (location.pathname.indexOf('/evaluador') === 0) return 'mora';
    if (location.pathname.indexOf('/contabilidad') === 0) return 'diava';
    var m = document.body && document.body.getAttribute('data-ia-modulo');
    return IAS[m] ? m : null;
  }
  function raiz() { return document.querySelector('[data-ia-raiz]') || document.querySelector('.app-content') || document.querySelector('main') || document.body; }
  var css = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:12px 18px;background:#1F1A17;color:#fff;font:700 14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;min-height:44px';
  var boton = document.createElement('button'); boton.type = 'button'; boton.className = 'no-print ia-rellenar-boton'; boton.setAttribute('style', css);
  boton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path></svg><span></span>';
  function refrescarBoton() { var m = modulo(); boton.style.display = m ? 'flex' : 'none'; if (m) { boton.querySelector('span').textContent = IAS[m] + ' · Dictar o adjuntar'; boton.setAttribute('aria-label', 'Dictar o adjuntar para que ' + IAS[m] + ' llene esta pantalla'); } }
  function montar() { if (!document.body) return setTimeout(montar, 200); var st = document.createElement('style'); st.textContent = '@media (max-width:760px){.ia-rellenar-boton{bottom:calc(92px + env(safe-area-inset-bottom))!important;padding:10px 14px!important;font-size:13px!important}}@media print{.ia-rellenar-boton,.ia-rellenar-dialogo{display:none!important}}'; document.head.appendChild(st); document.body.appendChild(boton); refrescarBoton(); new MutationObserver(refrescarBoton).observe(document.body, { attributes: true, attributeFilter: ['data-ia-modulo'] }); }
  montar();

  // ---------- Campos de la pantalla ----------
  function visible(el) { if (!el || el.disabled || el.readOnly) return false; var r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) return false; var s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none'; }
  function limpio(t) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, 140); }
  function etiqueta(el) {
    if (el.getAttribute('aria-label')) return limpio(el.getAttribute('aria-label'));
    if (el.labels && el.labels[0]) { var c = el.labels[0].cloneNode(true); Array.prototype.forEach.call(c.querySelectorAll('input,select,textarea,small,span[role=alert]'), function (x) { x.remove(); }); var t = limpio(c.textContent); if (t) return t; }
    if (el.id) { var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l && limpio(l.textContent)) return limpio(l.textContent); }
    var td = el.closest('td'); if (td) { var tr = td.parentElement, tabla = td.closest('table'), i = Array.prototype.indexOf.call(tr.children, td), th = tabla && tabla.querySelector('thead tr') && tabla.querySelector('thead tr').children[i]; var fila = limpio((tr.children[0] && tr.children[0] !== td ? tr.children[0].textContent : '')); if (th) return limpio((fila ? fila + ' · ' : '') + th.textContent); }
    var p = el.previousElementSibling; if (p && limpio(p.textContent)) return limpio(p.textContent);
    if (el.placeholder) return limpio(el.placeholder);
    return limpio(el.name || el.id || 'Campo');
  }
  function seccion(el, root) { var h = null, todos = root.querySelectorAll('h1,h2,h3,h4,legend,.sec-t,.card-t'); for (var i = 0; i < todos.length; i++) { if (todos[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) h = todos[i]; } return h ? limpio(h.textContent).slice(0, 80) : ''; }
  function tipo(el, lab) {
    if (el.tagName === 'SELECT') return 'opcion'; if (el.type === 'checkbox') return 'si_no';
    if (el.type === 'date') return 'fecha'; if (el.type === 'month') return 'mes';
    if (el.type === 'number' || el.inputMode === 'decimal' || el.inputMode === 'numeric') return /%/.test(lab) ? 'porcentaje' : 'numero';
    return 'texto';
  }
  // Identificador estable (sección + etiqueta + orden): sobrevive a pantallas que se redibujan al cambiar un valor.
  function huella(t) { var h = 5381; for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h.toString(36); }
  function campos(conElementos) {
    var root = raiz(), lista = [], vistos = {};
    Array.prototype.forEach.call(root.querySelectorAll('input,select,textarea'), function (el) {
      if (el.closest('.ia-rellenar-dialogo')) return;
      if (['hidden', 'file', 'password', 'button', 'submit', 'reset', 'radio', 'search', 'range', 'color', 'image'].indexOf(el.type) >= 0) return;
      if (!visible(el)) return; var lab = etiqueta(el); if (/buscar/i.test(lab)) return;
      var sec = seccion(el, root), base = sec + '|' + lab; vistos[base] = (vistos[base] || 0) + 1;
      var id = 'c' + huella(base + '|' + vistos[base]); el.setAttribute('data-ia-id', id);
      var t = tipo(el, lab), c = { id: id, etiqueta: lab, seccion: sec, tipo: t, valor: el.type === 'checkbox' ? (el.checked ? 'si' : 'no') : el.tagName === 'SELECT' ? limpio(el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '') : String(el.value || '').slice(0, 400) };
      if (t === 'opcion') c.opciones = Array.prototype.map.call(el.options, function (o) { return limpio(o.text); }).filter(Boolean).slice(0, 60);
      if (conElementos) c.el = el;
      lista.push(c);
    });
    return lista.slice(0, 300);
  }
  function aplicarValor(el, v) {
    if (el.type === 'checkbox') { var on = v === 'si'; if (el.checked !== on) el.click(); return; }
    if (el.tagName === 'SELECT') { var op = Array.prototype.find.call(el.options, function (o) { return limpio(o.text).toLowerCase() === String(v).toLowerCase() || o.value === v; }); if (!op) return; v = op.value; }
    var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- Adjuntos (imágenes se comprimen en el navegador) ----------
  function b64(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); }
  function preparar(f) {
    return new Promise(function (ok, mal) {
      if (f.type === 'application/pdf') { if (f.size > 4.5e6) return mal(Error('El PDF «' + f.name + '» pesa más de 4.5 MB.')); return f.arrayBuffer().then(function (b) { ok({ nombre: f.name, mime: f.type, datos: b64(b) }); }, mal); }
      if (!/^image\//.test(f.type)) return mal(Error('Adjunta imágenes o PDF.'));
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () { var k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok({ nombre: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', datos: c.toDataURL('image/jpeg', 0.82).split(',')[1] }); };
      img.onerror = function () { URL.revokeObjectURL(url); mal(Error('No se pudo leer la imagen «' + f.name + '».')); };
      img.src = url;
    });
  }
  function rpc(m, args) {
    return fetch('/api/rpc/db.' + m, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Orok-Request': '1' }, body: JSON.stringify({ args: args }), signal: AbortSignal.timeout(150000) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw Error(j.error); return j.value; });
  }

  // ---------- Diálogo ----------
  var dlg = null;
  function h(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function abrir() {
    var m = modulo(); if (!m) return; cerrar();
    var adjuntos = [], escuchando = null;
    dlg = h('div', { class: 'ia-rellenar-dialogo no-print', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ia-r-t', style: 'position:fixed;inset:0;z-index:2147483001;background:rgba(31,26,23,.45);display:flex;align-items:center;justify-content:center;padding:16px;font:14px system-ui,sans-serif;color:#1F1A17' });
    var caja = h('div', { style: 'background:#fff;border-radius:20px;width:min(860px,100%);max-height:92vh;overflow:auto;padding:22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.3)' });
    caja.innerHTML = '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2 id="ia-r-t" style="margin:0;font-size:20px">' + IAS[m] + ' · Dictar o adjuntar</h2><p style="margin:4px 0 0;color:#6B625C">Dicta o escribe lo que quieres llenar y, si quieres, adjunta imágenes o PDF (plano, partida, brochure, presupuesto, captura). ' + IAS[m] + ' te propone los valores de esta pantalla y tú eliges cuáles aplicar.</p></div><button type="button" data-a="cerrar" aria-label="Cerrar" style="border:1px solid #E7E0DA;background:#fff;border-radius:10px;width:40px;height:40px;cursor:pointer;font-size:18px">×</button></div>'
      + '<label style="display:flex;flex-direction:column;gap:6px;font-weight:700">Indicación<textarea data-a="texto" rows="4" placeholder="Ej.: Proyecto Ventura, BMG, Av. Tarapacá 631, terreno de 300 m², 8 pisos, 11 departamentos; costo de construcción como Infinity 224" style="font:15px system-ui,sans-serif;border:1px solid #D8CFC7;border-radius:12px;padding:10px;resize:vertical"></textarea></label>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><button type="button" data-a="mic" style="border:1px solid #D8CFC7;background:#fff;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer;min-height:44px">🎙 Dictar</button>'
      + '<label style="border:1px solid #D8CFC7;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer;min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center">📎 Adjuntar imágenes o PDF<input data-a="archivos" type="file" accept="image/*,application/pdf" multiple hidden></label>'
      + '<span data-a="lista" style="font-size:13px;color:#6B625C"></span><span style="flex:1"></span><button type="button" data-a="proponer" style="border:0;background:#85442A;color:#fff;border-radius:12px;padding:11px 18px;font-weight:700;cursor:pointer;min-height:44px">Proponer cambios</button></div>'
      + '<p data-a="estado" role="status" style="margin:0;font-size:13px;color:#6B625C"></p><div data-a="resultado"></div>';
    dlg.appendChild(caja); document.body.appendChild(dlg);
    var $ = function (a) { return caja.querySelector('[data-a="' + a + '"]'); }, estado = function (t, malo) { $('estado').textContent = t; $('estado').style.color = malo ? '#b91c1c' : '#6B625C'; };
    $('cerrar').onclick = cerrar; dlg.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); }); dlg.addEventListener('mousedown', function (e) { if (e.target === dlg) cerrar(); });
    $('texto').focus();
    $('archivos').onchange = function (e) {
      var fs = Array.prototype.slice.call(e.target.files || [], 0, 4 - adjuntos.length); e.target.value = ''; estado('Preparando adjuntos…');
      Promise.all(fs.map(preparar)).then(function (xs) { adjuntos = adjuntos.concat(xs).slice(0, 4); $('lista').textContent = adjuntos.map(function (x) { return x.nombre; }).join(' · '); estado(''); }, function (x) { estado(x.message, true); });
    };
    $('mic').onclick = function () {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition, b = $('mic');
      if (escuchando) { escuchando.stop(); return; }
      if (SR) {
        var r = new SR(), base = $('texto').value; r.lang = 'es-PE'; r.continuous = true; r.interimResults = true;
        r.onresult = function (ev) { var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; $('texto').value = (base ? base + ' ' : '') + t; };
        r.onend = function () { escuchando = null; b.textContent = '🎙 Dictar'; estado(''); }; r.onerror = function (ev) { estado('No se pudo usar el micrófono (' + ev.error + ').', true); };
        escuchando = r; r.start(); b.textContent = '■ Detener dictado'; estado('Escuchando… habla con naturalidad.'); return;
      }
      if (!navigator.mediaDevices || !window.MediaRecorder) return estado('Este navegador no permite dictar. Escribe la indicación.', true);
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
        var rec = new MediaRecorder(st), partes = []; rec.ondataavailable = function (e) { partes.push(e.data); };
        rec.onstop = function () { st.getTracks().forEach(function (t) { t.stop(); }); escuchando = null; b.textContent = '🎙 Dictar'; estado('Transcribiendo…');
          var blob = new Blob(partes, { type: rec.mimeType || 'audio/webm' }); blob.arrayBuffer().then(function (buf) { return rpc('transcribeLolaAssistant', [{ mime: blob.type, audio: b64(buf) }]); })
            .then(function (r) { $('texto').value = ($('texto').value ? $('texto').value + ' ' : '') + (r.text || r.texto || ''); estado(''); }, function (x) { estado(x.message, true); }); };
        escuchando = { stop: function () { rec.stop(); } }; rec.start(); b.textContent = '■ Detener dictado'; estado('Grabando… (máximo 1 minuto)'); setTimeout(function () { if (rec.state === 'recording') rec.stop(); }, 60000);
      }, function () { estado('No se dio permiso al micrófono.', true); });
    };
    $('proponer').onclick = function () {
      var lista = campos(); if (!lista.length) return estado('Esta pantalla no tiene campos para llenar. Ve a la sección que quieres completar y vuelve a abrir.', true);
      if (!$('texto').value.trim() && !adjuntos.length) return estado('Dicta, escribe o adjunta algo.', true);
      $('proponer').disabled = true; estado(IAS[m] + ' está leyendo… (puede tardar hasta un minuto con imágenes)'); $('resultado').innerHTML = '';
      var pantalla = limpio((document.querySelector('.tab.on,.nav-item[aria-current=page],.side-item[aria-current=page],h1,h2') || {}).textContent || document.title);
      rpc('iaRellenar', [{ modulo: m, pantalla: pantalla, campos: lista, texto: $('texto').value, adjuntos: adjuntos }]).then(function (r) { estado(''); mostrar(r); }, function (x) { estado(x.message, true); }).then(function () { $('proponer').disabled = false; });
    };
    function mostrar(r) {
      var res = $('resultado'), html = '<div style="background:#FAF7F4;border-radius:12px;padding:12px;margin-bottom:10px"><b>' + esc(r.ia) + ' entendió:</b> ' + esc(r.resumen || '—') + '</div>';
      if (r.preguntas && r.preguntas.length) html += '<div style="background:#FDF0E3;color:#7A3410;border-radius:12px;padding:12px;margin-bottom:10px"><b>Le falta o no está claro:</b><ul style="margin:6px 0 0;padding-left:18px">' + r.preguntas.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>';
      if (!r.cambios.length) { res.innerHTML = html + '<p>No hay cambios que proponer para los campos de esta pantalla.</p>'; return; }
      html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:640px"><thead><tr style="text-align:left;color:#6B625C"><th style="padding:6px"><input type="checkbox" data-a="todos" checked aria-label="Marcar todos"></th><th style="padding:6px">Campo</th><th style="padding:6px">Actual</th><th style="padding:6px">Propuesto</th><th style="padding:6px">De dónde sale</th></tr></thead><tbody>'
        + r.cambios.map(function (c, i) { var col = c.confianza === 'alta' ? '#24522F' : c.confianza === 'media' ? '#8A3A10' : '#991b1b';
          return '<tr style="border-top:1px solid #EFE9E4"><td style="padding:6px"><input type="checkbox" data-i="' + i + '" ' + (c.confianza === 'baja' ? '' : 'checked') + ' aria-label="Aplicar ' + esc(c.etiqueta) + '"></td><td style="padding:6px"><b>' + esc(c.etiqueta) + '</b>' + (c.seccion ? '<div style="color:#6B625C;font-size:11px">' + esc(c.seccion) + '</div>' : '') + '</td><td style="padding:6px;color:#6B625C">' + esc(c.actual || '—') + '</td><td style="padding:6px"><input data-v="' + i + '" value="' + esc(c.propuesto) + '" aria-label="Valor propuesto para ' + esc(c.etiqueta) + '" style="font:13px system-ui,sans-serif;border:1px solid #D8CFC7;border-radius:8px;padding:6px;width:100%;box-sizing:border-box;min-width:120px"></td><td style="padding:6px">' + esc(c.fuente) + '<div style="color:' + col + ';font-size:11px;font-weight:700">confianza ' + esc(c.confianza) + '</div>' + (c.nota ? '<div style="color:#6B625C;font-size:11px">' + esc(c.nota) + '</div>' : '') + '</td></tr>'; }).join('')
        + '</tbody></table></div>' + (r.archivados && r.archivados.length ? '<p style="font-size:12px;color:#6B625C">Adjuntos guardados en Drive: ' + r.archivados.map(function (a) { return esc(a.nombre) + ' → ' + esc(a.carpeta); }).join(', ') + '</p>' : '')
        + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" data-a="aplicar" style="border:0;background:#85442A;color:#fff;border-radius:12px;padding:11px 18px;font-weight:700;cursor:pointer;min-height:44px">Aplicar los marcados</button></div>';
      res.innerHTML = html;
      res.querySelector('[data-a="todos"]').onchange = function (e) { Array.prototype.forEach.call(res.querySelectorAll('input[data-i]'), function (x) { x.checked = e.target.checked; }); };
      res.querySelector('[data-a="aplicar"]').onclick = function () {
        var n = 0; r.cambios.forEach(function (c, i) { var ok = res.querySelector('input[data-i="' + i + '"]'); if (!ok || !ok.checked) return; var f = campos(true).find(function (x) { return x.id === c.campo; }), el = f && f.el; if (!el) return; aplicarValor(el, res.querySelector('input[data-v="' + i + '"]').value); n++; });
        cerrar(); aviso('Se aplicaron ' + n + ' cambio(s). Revísalos y guarda como siempre en esta pantalla.');
      };
    }
  }
  function cerrar() { if (dlg) { dlg.remove(); dlg = null; } boton.focus(); }
  function aviso(t) { var a = h('div', { role: 'status', class: 'no-print', style: 'position:fixed;left:50%;transform:translateX(-50%);bottom:76px;z-index:2147483000;background:#24522F;color:#fff;border-radius:12px;padding:12px 16px;font:600 14px system-ui,sans-serif;max-width:420px' }, esc(t)); document.body.appendChild(a); setTimeout(function () { a.remove(); }, 7000); }
  boton.addEventListener('click', abrir);
  window.iaRellenar = { campos: campos, abrir: abrir, aplicarValor: aplicarValor };
})();
