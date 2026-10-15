'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {webcrypto}=require('node:crypto');
const {TextEncoder}=require('node:util');

function accounts(){
  const window={};
  runInNewContext(readFileSync('accounts.js','utf8'),{
    window,crypto:webcrypto,TextEncoder,Uint8Array,Array,
    btoa:input=>Buffer.from(input,'binary').toString('base64')
  },{timeout:1000});
  return window.TabiAccounts;
}
test('same login credentials always derive the same encrypted room',async()=>{
  const account=accounts();
  const first=await account.derive('Journey_User','my-strong-password-2026');
  const second=await account.derive('journey_user','my-strong-password-2026');
  assert.equal(first.username,'journey_user');
  assert.equal(first.roomId,second.roomId);
  assert.equal(first.key,second.key);
  assert.match(first.roomId,/^[a-f0-9-]{36}$/);
  assert.equal(first.key.length,43);
});
test('wrong password cannot obtain the account secret',async()=>{
  const account=accounts();
  const first=await account.derive('journey_user','my-strong-password-2026');
  const other=await account.derive('journey_user','a-different-password-2026');
  assert.equal(first.roomId,other.roomId);
  assert.notEqual(first.key,other.key);
});
test('account credentials are validated before access',async()=>{
  const account=accounts();
  await assert.rejects(()=>account.derive('abc','a-long-enough-password'),/invalid_id/);
  await assert.rejects(()=>account.derive('hello@example.com','a-long-enough-password'),/invalid_id/);
  await assert.rejects(()=>account.derive('journey_user','short'),/weak_password/);
});
test('existing trips and UI are hooked up to the encrypted account vault',()=>{
  const source=readFileSync('app.js','utf8');
  const ui=readFileSync('account-ui.js','utf8');
  const html=readFileSync('index.html','utf8');
  assert.match(source,/accountSession=window\.TabiAccounts/);
  assert.match(source,/window\.TabiAccountBridge=/);
  assert.match(ui,/account\.register/);
  assert.match(ui,/account\.login/);
  assert.match(html,/id="accountRegister"/);
  assert.match(html,/id="accountLogin"/);
  assert.match(html,/account-ui\.js/);
});