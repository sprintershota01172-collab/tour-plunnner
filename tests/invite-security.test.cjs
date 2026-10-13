'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto,randomBytes}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {TextEncoder,TextDecoder}=require('node:util');
function api(){
  const host={};
  runInNewContext(readFileSync('sync.js','utf8'),{
    window:host,
    crypto:webcrypto,
    URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,structuredClone,
    btoa:value=>Buffer.from(value,'binary').toString('base64'),
    atob:value=>Buffer.from(value,'base64').toString('binary'),
    location:{origin:'https://example.com',pathname:'/tabi/'}
  },{timeout:1000});
  return host.TabiSharing;
}
const roomId='123e4567-e89b-42d3-a456-426614174000';
const key=randomBytes(32).toString('base64url');
const metadata={roomId,key};
test('plain invitation remains backward compatible',()=>{
  const sharing=api();
  const link=sharing.link(metadata);
  assert.match(link,/^https:\/\/example.com\/tabi\/#join=/);
  const parsed=sharing.parseInvite(new URL(link).hash);
  assert.equal(parsed.roomId,roomId);
  assert.equal(parsed.key,key);
  assert.equal(sharing.parseInvite('#join=not-an-id.abc'),null);
});
test('password-wrapped invitation does not reveal the room key',async()=>{
  const sharing=api();
  const url=await sharing.protectInvite(metadata,'an-enormously-long-secret-phrase');
  assert.equal(url.includes(key),false);
  assert.equal(url.includes('an-enormously-long-secret-phrase'),false);
  const parsed=sharing.parseInvite(new URL(url).hash);
  assert.equal(parsed.locked,true);
  assert.equal(parsed.key,undefined);
  const unlocked=await sharing.unlockInvite(parsed,'an-enormously-long-secret-phrase');
  assert.equal(unlocked.roomId,roomId);
  assert.equal(unlocked.key,key);
  await assert.rejects(()=>sharing.unlockInvite(parsed,'not-the-real-password'),/wrong_password/);
  await assert.rejects(()=>sharing.unlockInvite(parsed,''),/password_required/);
});
test('short passwords and invalid invite fragments are rejected',async()=>{
  const sharing=api();
  await assert.rejects(()=>sharing.protectInvite(metadata,'short'),/weak_password/);
  assert.equal(sharing.parseInvite('#joinp=123e4567-e89b-42d3-a456-426614174000.bad.bad.bad'),null);
  assert.equal(sharing.parseInvite('#joinp='+'x'.repeat(2000)),null);
});
