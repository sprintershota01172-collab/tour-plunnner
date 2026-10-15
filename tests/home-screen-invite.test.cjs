'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {webcrypto}=require('node:crypto');
const {TextEncoder,TextDecoder}=require('node:util');

function sharing(){
  const window={};
  runInNewContext(readFileSync('sync.js','utf8'),{
    window,crypto:webcrypto,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,structuredClone,
    btoa:s=>Buffer.from(s,'binary').toString('base64'),
    atob:s=>Buffer.from(s,'base64').toString('binary'),
    location:{origin:'https://example.com',pathname:'/tabi/'}
  },{timeout:1000});
  return window.TabiSharing;
}
test('Home Screen installs keep the source URL instead of a fixed start_url',()=>{
  const manifest=JSON.parse(readFileSync('manifest.webmanifest','utf8'));
  assert.equal(Object.hasOwn(manifest,'start_url'),false);
  assert.equal(manifest.id,'./');
});
test('only same-site invitation URLs can be pasted into Home Screen recovery',()=>{
  const api=sharing();
  const url=api.link({roomId:'123e4567-e89b-42d3-a456-426614174000',key:'A'.repeat(43)});
  assert.equal(api.parseInviteUrl(url).roomId,'123e4567-e89b-42d3-a456-426614174000');
  assert.equal(api.parseInviteUrl(url.replace('/tabi/','/tabi/index.html')).roomId,'123e4567-e89b-42d3-a456-426614174000');
  assert.equal(api.parseInviteUrl(url.replace('example.com','evil.example')),null);
  assert.equal(api.parseInviteUrl(url.replace('/tabi/','/other/')),null);
  assert.equal(api.parseInviteUrl(url.replace('#join=','?key=secret#join=')),null);
  assert.equal(api.parseInviteUrl('not an invite'),null);
});
test('opening an invite no longer removes its fragment before installation',()=>{
  const source=readFileSync('app.js','utf8');
  assert.match(source,/pendingInvite=sharedApi\.parseInvite\(location\.hash\)/);
  assert.doesNotMatch(source,/pendingInvite=sharedApi\.parseInvite\(location\.hash\);if\(pendingInvite\)history\.replaceState/);
  assert.match(source,/if\(pendingInvite&&!pendingInvite\.locked&&isHomeApp\(\)&&accountSession\)joinPartnerRoom\(\)/);
});