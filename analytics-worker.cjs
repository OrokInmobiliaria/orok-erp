'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {analytics}=require('./business/analyticsService');

try {
  parentPort.postMessage({value:analytics(workerData.data,workerData.filters||{})});
} catch (error) {
  parentPort.postMessage({error:String(error.message||'No se pudo generar el análisis.')});
}
