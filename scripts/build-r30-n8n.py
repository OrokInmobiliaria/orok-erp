#!/usr/bin/env python3
"""R30: agrega a una copia del flujo vigente el resumen diario (R29) y los flujos de voz, publicación y ciclo creativo (R30).
Los 84 nodos existentes y sus conexiones no se modifican. El resultado queda INACTIVO."""
import json, sys, uuid, copy
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
original = copy.deepcopy(d)
names = {n['name'] for n in d['nodes']}
URL = next(n for n in d['nodes'] if n['name'] == 'Seguimiento 24 horas y conciliación')['parameters']['url']
CRED = next(n for n in d['nodes'] if n['name'] == 'Seguimiento 24 horas y conciliación')['credentials']
GMAIL = next(n for n in d['nodes'] if n['name'] == 'Avisar ventas por correo')['credentials']
X, Y = 1104, 10000
N_TRIGGER, N_GET, N_IF, N_MAIL, N_CONFIRM, N_NOTE = (
    'Resumen diario de gestión · 7:30', 'Preparar resumen diario en CRM', '¿Corresponde enviar el resumen?',
    'Enviar resumen diario por correo', 'Confirmar envío del resumen', 'R29 · Resumen diario de gestión')
for n in (N_TRIGGER, N_GET, N_IF, N_MAIL, N_CONFIRM, N_NOTE):
    assert n not in names, n

def http(name, body, pos, timeout=30000):
    return {"parameters": {"method": "POST", "url": URL, "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True, "headerParameters": {"parameters": [{"name": "Content-Type", "value": "application/json"}]},
            "sendBody": True, "specifyBody": "json", "jsonBody": body, "options": {"timeout": timeout}},
            "id": str(uuid.uuid4()), "name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos, "credentials": copy.deepcopy(CRED)}

new = [
 {"parameters": {"content": "## R29 · Resumen diario de gestión\nCada mañana (7:30, hora del servidor n8n) pide al CRM el resumen y lo envía por correo a Gerencia.\n\n- El CRM decide si corresponde enviar: función activada, correos configurados y no enviado hoy.\n- Si Gmail falla, no se confirma y el siguiente intento del mismo día vuelve a enviarlo.\n- Configuración y correos: CRM > Campañas > Asistente de marketing.\n- Verifica que la zona horaria de n8n sea America/Lima.", "height": 300, "width": 560, "color": 4},
  "id": str(uuid.uuid4()), "name": N_NOTE, "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [X - 40, Y - 340]},
 {"parameters": {"rule": {"interval": [{"field": "cronExpression", "expression": "30 7 * * *"}]}},
  "id": str(uuid.uuid4()), "name": N_TRIGGER, "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [X, Y]},
 http(N_GET, "={{ JSON.stringify({action:'daily_brief_get'}) }}", [X + 320, Y]),
 {"parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
   "conditions": [{"id": str(uuid.uuid4()), "leftValue": "={{ $json.value.send }}", "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}], "combinator": "and"}, "options": {}},
  "id": str(uuid.uuid4()), "name": N_IF, "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": [X + 640, Y]},
 {"parameters": {"sendTo": "={{ $json.value.recipients }}", "subject": "={{ $json.value.subject }}", "emailType": "html", "message": "={{ $json.value.html }}", "options": {}},
  "id": str(uuid.uuid4()), "name": N_MAIL, "type": "n8n-nodes-base.gmail", "typeVersion": 2.2, "position": [X + 960, Y - 80],
  "webhookId": str(uuid.uuid4()), "credentials": copy.deepcopy(GMAIL)},
 http(N_CONFIRM, "={{ JSON.stringify({action:'daily_brief_confirm', date:$('" + N_GET + "').first().json.value.date}) }}", [X + 1280, Y - 80]),
]

c = d['connections']
def node(name, typ, tv, params, pos, extra=None):
    n = {"parameters": params, "id": str(uuid.uuid4()), "name": name, "type": typ, "typeVersion": tv, "position": pos}
    n.update(extra or {}); return n
def note(name, content, pos, w=560, h=300):
    return node(name, "n8n-nodes-base.stickyNote", 1, {"content": content, "height": h, "width": w, "color": 5}, pos)
def cron(name, expr, pos):
    return node(name, "n8n-nodes-base.scheduleTrigger", 1.2, {"rule": {"interval": [{"field": "cronExpression", "expression": expr}]}}, pos)
def cond(name, expr, pos):
    return node(name, "n8n-nodes-base.if", 2.2, {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [{"id": str(uuid.uuid4()), "leftValue": expr, "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}], "combinator": "and"}, "options": {}}, pos)
def link(src, dst, out=0):
    c.setdefault(src, {"main": []})
    while len(c[src]["main"]) <= out: c[src]["main"].append([])
    c[src]["main"][out].append({"node": dst, "type": "main", "index": 0})
def placeholder(name, url, body, pos, binary=False):
    p = {"method": "POST", "url": url, "sendBody": True, "specifyBody": "json", "jsonBody": body, "options": {"timeout": 60000}}
    if binary: p["options"]["response"] = {"response": {"responseFormat": "file"}}
    return node(name, "n8n-nodes-base.httpRequest", 4.2, p, pos, {"onError": "continueErrorOutput"})

# ---------------- R30 ----------------
Y2 = 10700
V = dict(trig='Voz IA · revisar cola cada 2 minutos', claim='Tomar voz pendiente en CRM', has='¿Hay una voz pendiente?',
         gen='CONECTAR · Generar voz con el proveedor', b64='Preparar audio para el CRM', done='Entregar voz al CRM', fail='Avisar fallo de voz al CRM')
P = dict(trig='Publicación · revisar cola cada 5 minutos', claim='Tomar publicación pendiente en CRM', has='¿Hay una publicación pendiente?', media='Traer archivo de la pieza',
         dry='¿Modo ensayo?', pub='CONECTAR · Publicar en Meta o TikTok', done='Confirmar publicación al CRM', fail='Avisar fallo de publicación al CRM')
C = dict(trig='Ciclo creativo · lunes 9:00', tick='Pedir al CRM el ciclo creativo')
r30 = [
 note('R30 · Voz IA (desconectado)', "## R30 · Voz sintética\nEl CRM entrega el guion de una pieza aprobada; el proveedor devuelve un MP3; se guarda como 'Voz IA' en la campaña.\n\n**Para conectar:** en el nodo CONECTAR cambia la URL .invalid por la del proveedor, agrega SU credencial en n8n (la clave nunca va al CRM) y ajusta el cuerpo. Luego activa la voz en CRM > Campañas > Asistente de marketing.", [X - 40, Y2 - 360]),
 cron(V['trig'], '*/2 * * * *', [X, Y2]),
 http(V['claim'], "={{ JSON.stringify({action:'voice_job_claim'}) }}", [X + 320, Y2]),
 cond(V['has'], "={{ !!$json.value?.job }}", [X + 640, Y2]),
 placeholder(V['gen'], "https://CONFIGURAR-PROVEEDOR-DE-VOZ.invalid/text-to-speech", "={{ JSON.stringify({text:$json.value.job.script, voice:$json.value.job.voice_label}) }}", [X + 960, Y2 - 80], binary=True),
 node(V['b64'], "n8n-nodes-base.code", 2, {"mode": "runOnceForAllItems", "jsCode": "const buf = await this.helpers.getBinaryDataBuffer(0, 'data');\nreturn [{ json: { data_base64: buf.toString('base64') } }];"}, [X + 1280, Y2 - 160]),
 http(V['done'], "={{ JSON.stringify({action:'voice_job_complete', job_id:$('" + V['claim'] + "').first().json.value.job.id, lease_token:$('" + V['claim'] + "').first().json.value.job.lease_token, data_base64:$json.data_base64}) }}", [X + 1600, Y2 - 160], timeout=120000),
 http(V['fail'], "={{ JSON.stringify({action:'voice_job_fail', job_id:$('" + V['claim'] + "').first().json.value.job.id, lease_token:$('" + V['claim'] + "').first().json.value.job.lease_token, reason:'El proveedor de voz no respondió'}) }}", [X + 1280, Y2 + 40]),
 note('R30 · Publicación (desconectada)', "## R30 · Publicación en redes\nEl CRM entrega solo piezas de campañas APROBADAS y ya exportadas, a la hora programada. En modo ensayo no se publica nada.\n\n**Para conectar:** en el nodo CONECTAR ajusta la llamada a Meta Graph API o TikTok con SU credencial (la clave nunca va al CRM). Mantén el modo ensayo hasta probar. Luego activa la cola en CRM > Campañas > Asistente de marketing.", [X - 40, Y2 + 380]),
 cron(P['trig'], '*/5 * * * *', [X, Y2 + 740]),
 http(P['claim'], "={{ JSON.stringify({action:'publication_job_claim'}) }}", [X + 320, Y2 + 740]),
 cond(P['has'], "={{ !!$json.value?.job }}", [X + 640, Y2 + 740]),
 http(P['media'], "={{ JSON.stringify({action:'publication_job_media', job_id:$('" + P['claim'] + "').first().json.value.job.id, lease_token:$('" + P['claim'] + "').first().json.value.job.lease_token, index:0}) }}", [X + 960, Y2 + 660], timeout=60000),
 cond(P['dry'], "={{ $('" + P['claim'] + "').first().json.value.job.dry_run === true }}", [X + 1280, Y2 + 660]),
 placeholder(P['pub'], "https://CONFIGURAR-RED-SOCIAL.invalid/publicar", "={{ JSON.stringify({channel:$('" + P['claim'] + "').first().json.value.job.channel, caption:$('" + P['claim'] + "').first().json.value.job.caption, mime:$json.mime, data_base64:$json.data_base64}) }}", [X + 1600, Y2 + 760]),
 http(P['done'], "={{ JSON.stringify({action:'publication_job_complete', job_id:$('" + P['claim'] + "').first().json.value.job.id, lease_token:$('" + P['claim'] + "').first().json.value.job.lease_token, external_id:String($json.id ?? $json.post_id ?? 'ensayo'), permalink:String($json.permalink ?? '')}) }}", [X + 1920, Y2 + 660]),
 http(P['fail'], "={{ JSON.stringify({action:'publication_job_fail', job_id:$('" + P['claim'] + "').first().json.value.job.id, lease_token:$('" + P['claim'] + "').first().json.value.job.lease_token, reason:'La red social no aceptó la publicación'}) }}", [X + 1920, Y2 + 900]),
 note('R30 · Ciclo creativo', "## R30 · Ciclo creativo automático\nCada lunes pide al CRM crear borradores nuevos desde las campañas base y solicitar propuesta a Claude. El CRM decide si está activado. Nunca aprueba ni publica.", [X - 40, Y2 + 1400], 560, 160),
 cron(C['trig'], '0 9 * * 1', [X, Y2 + 1620]),
 http(C['tick'], "={{ JSON.stringify({action:'creative_cycle_tick'}) }}", [X + 320, Y2 + 1620], timeout=60000),
]
# cabecera extra para el audio grande
for n in r30:
    if n['name'] == V['done']:
        n['parameters']['sendHeaders'] = True
        n['parameters']['headerParameters']['parameters'].append({"name": "x-orok-payload", "value": "audio"})
new.extend(r30)
d['nodes'].extend(new)
link(V['trig'], V['claim']); link(V['claim'], V['has']); link(V['has'], V['gen'], 0)
link(V['gen'], V['b64'], 0); link(V['gen'], V['fail'], 1); link(V['b64'], V['done'])
link(P['trig'], P['claim']); link(P['claim'], P['has']); link(P['has'], P['media'], 0); link(P['media'], P['dry'])
link(P['dry'], P['done'], 0); link(P['dry'], P['pub'], 1); link(P['pub'], P['done'], 0); link(P['pub'], P['fail'], 1)
link(C['trig'], C['tick'])

c = d['connections']
c[N_TRIGGER] = {"main": [[{"node": N_GET, "type": "main", "index": 0}]]}
c[N_GET] = {"main": [[{"node": N_IF, "type": "main", "index": 0}]]}
c[N_IF] = {"main": [[{"node": N_MAIL, "type": "main", "index": 0}], []]}
c[N_MAIL] = {"main": [[{"node": N_CONFIRM, "type": "main", "index": 0}]]}
d['active'] = False
d['name'] = 'LOLA - ENSAYO 955318057 - 67.6.13 r30 - MARKETING Y CONEXIONES - INACTIVO'
d['versionId'] = str(uuid.uuid4())
d.pop('id', None)
# verificación: nada existente cambió
for n in original['nodes']:
    assert next(m for m in d['nodes'] if m['id'] == n['id']) == n, n['name']
for k, v in original['connections'].items():
    assert d['connections'][k] == v, k
assert len(d['nodes']) == len(original['nodes']) + len(new)
assert len({n['name'] for n in d['nodes']}) == len(d['nodes']) and len({n['id'] for n in d['nodes']}) == len(d['nodes'])
json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('nodos', len(original['nodes']), '->', len(d['nodes']), '· activo:', d['active'])
