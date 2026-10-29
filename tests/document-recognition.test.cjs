'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessDocument,extractJson,namesCompatible,recognizeSeparationDocument,recognizeWithGemini}=require('../business/documentRecognition');

const separation={dni:'12345678',client_name:'Martín Montezuma',separation_amount:4800};

test('DNI matching is informative and masks the stored reading',()=>{
 const review=assessDocument('dni',{document_type:'DNI',dni:'12345678',full_name:'MARTIN MONTEZUMA',legible:true,confidence:.96},separation);
 assert.equal(review.status,'match');assert.equal(review.checks.dni_match,true);assert.equal(review.checks.name_match,true);assert.equal(review.extracted.dni_last4,'5678');assert.equal('dni' in review.extracted,false);
});

test('a different DNI is marked for manual review',()=>{
 const review=assessDocument('dni',{document_type:'DNI',dni:'87654321',full_name:'Otra Persona',legible:true,confidence:.9},separation);
 assert.equal(review.status,'review');assert.equal(review.checks.dni_match,false);
});

test('voucher amount and operation are compared without changing business state',()=>{
 const matching=assessDocument('reservation_voucher',{amount:'4,800.00',currency:'PEN',operation_number:'OP-123',date:'2026-10-16',legible:true},separation);
 assert.equal(matching.status,'match');assert.equal(matching.checks.amount_match,true);assert.equal(matching.extracted.operation_number,'OP-123');
 const greater=assessDocument('reservation_voucher',{amount:5000,currency:'PEN',operation_number:'OP-OVER',legible:true},separation);assert.equal(greater.status,'match');
 const mismatch=assessDocument('reservation_voucher',{amount:4700,currency:'PEN',operation_number:'OP-124',legible:true},separation);
 assert.equal(mismatch.status,'review');assert.equal(mismatch.checks.amount_match,false);
});

test('signed separation remains manual review',()=>assert.equal(assessDocument('signed_separation',{},separation).status,'manual'));
test('names compare accents safely',()=>assert.equal(namesCompatible('Martín Montezuma Chirinos','MARTIN MONTEZUMA'),true));
test('JSON extraction accepts fenced output',()=>assert.equal(extractJson('```json\n{"dni":"12345678"}\n```').dni,'12345678'));
test('missing AI key never blocks document handling',async()=>assert.equal((await recognizeSeparationDocument({kind:'dni',bytes:Buffer.from('x'),mimeType:'image/jpeg',separation,apiKey:''})).status,'unavailable'));
test('Gemini document request uses Interactions 3.8 Flash without storage and returns a comparison',async()=>{
 const calls=[],fetcher=async(url,options={})=>{calls.push({url,options});return {ok:true,json:async()=>({steps:[{content:[{type:'text',text:'{"amount":4800,"currency":"PEN","operation_number":"ABC-9","date":"2026-10-16","bank":"Banco","recipient":"OROK","legible":true,"confidence":0.98}'}]}]})};};
 const result=await recognizeWithGemini({kind:'reservation_voucher',bytes:Buffer.from('voucher'),mimeType:'image/jpeg',separation,apiKey:'test-key',fetcher});
 assert.equal(result.status,'match');assert.equal(calls.length,1);assert.match(calls[0].url,/v1beta\/interactions$/);const body=JSON.parse(calls[0].options.body);assert.equal(body.model,'gemini-3.8-flash');assert.equal(body.store,false);assert.equal(body.input[1].type,'image');assert.equal(body.input[1].mime_type,'image/jpeg');assert.equal(body.input[1].data,Buffer.from('voucher').toString('base64'));
});

test('PDF document request uses the document input type',async()=>{
 const calls=[],fetcher=async(url,options={})=>{calls.push({url,options});return {ok:true,json:async()=>({output_text:'{"document_type":"DNI","dni":"12345678","full_name":"MARTIN MONTEZUMA","legible":true,"confidence":0.99}'})};};
 const result=await recognizeWithGemini({kind:'dni',bytes:Buffer.from('pdf'),mimeType:'application/pdf',separation,apiKey:'test-key',fetcher});
 assert.equal(result.status,'match');const body=JSON.parse(calls[0].options.body);assert.equal(body.input[0].type,'document');assert.equal(body.input[0].mime_type,'application/pdf');assert.equal(body.store,false);
});

test('document fallback keeps the file and exposes only a safe diagnostic',async()=>{
 const fetcher=async()=>({ok:false,status:403,json:async()=>({message:'API key AIza123456789012345678901234567890 is not allowed'})});
 const result=await recognizeSeparationDocument({kind:'dni',bytes:Buffer.from('jpg'),mimeType:'image/jpeg',separation,apiKey:'test-key',fetcher});
 assert.equal(result.status,'unavailable');assert.match(result.summary,/Gemini HTTP 403/);assert.doesNotMatch(result.summary,/AIza123/);
});
