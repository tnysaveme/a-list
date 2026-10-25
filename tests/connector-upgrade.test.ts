import test from 'node:test';
import assert from 'node:assert/strict';
import {connectorResponse} from '../lib/connector-errors.mjs';
// The local preview protocol remains JavaScript so it can also run without tsx.
import {invocationSchema,driverMessageSchema,grantsSchema} from '../scripts/connector-preview/protocol.mjs';

test('patched Zod preserves connector records, strict read grants and confirmed response projection',async()=>{
 const call={connectorId:'example',actionName:'read',arguments:{query:'film',nested:{page:1}}};
 assert.deepEqual(invocationSchema.parse(call),call);
 assert.equal(invocationSchema.safeParse({...call,accountId:'untrusted'}).success,false);
 assert.equal(grantsSchema.safeParse([{connectorId:'example',actionName:'read',readOnly:false}]).success,false);
 const reply={jsonrpc:'2.0',id:'11111111-1111-4111-8111-111111111111',result:{nested:{ok:true},values:[1,'film']}};
 assert.deepEqual(driverMessageSchema.parse(reply),reply);
 const response=connectorResponse({status:'success',result:{content:[{type:'text',text:'A film'}]},secret:'drop-this'});
 const data=await response.json();assert.equal(data.status,'success');assert.equal(data.secret,undefined);assert.equal(data.result.content[0].text,'A film');
 assert.equal(connectorResponse({status:'success',result:{content:'invalid'}}).status,502);
});
