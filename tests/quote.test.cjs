const {test}=require('node:test');
const assert=require('node:assert/strict');
const {quoteAmounts,PROJECT_ADDRESS,PROJECT_MAP_URL,EXECUTIVE_EMAILS}=require('../business/quotePDF.js');

test('quote applies the commercial discount to the complete list-price sum, with taxes included',()=>{
  const quote=quoteAmounts({price:400000,parkingPrice:56000,discount:5});
  assert.deepEqual(quote,{list:456000,discountAmount:22800,total:433200});
  assert.equal(quote.total,quote.list-quote.discountAmount);
});

test('quote keeps the project address, maps destination, and both sales emails',()=>{
  assert.equal(PROJECT_ADDRESS,'Calle La Apacheta 224, San Miguel');
  assert.match(PROJECT_MAP_URL,/google\.com\/maps/);
  assert.equal(EXECUTIVE_EMAILS,'ventas@orok.com.pe · hola@infinity224.pe');
});
