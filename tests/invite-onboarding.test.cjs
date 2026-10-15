'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('opening a partner invitation requires a logged-in account',()=>{
  const source=readFileSync('app.js','utf8');
  assert.match(source,/function openPartner\(\)\{\s*if\(pendingInvite&&!accountSession\)\{openInviteLogin\(\);return;\}/);
  assert.match(source,/async function joinPartnerRoom\(\)\{\s*if\(!sharing\|\|partnerBusy\|\|!pendingInvite\)return;\s*if\(!accountSession\)\{openInviteLogin\(\);return;\}/);
  assert.match(source,/isHomeApp\(\)&&accountSession\)joinPartnerRoom\(\)/);
});
test('new users return to the original invitation after registration',()=>{
  const main=readFileSync('app.js','utf8');
  const ui=readFileSync('account-ui.js','utf8');
  assert.match(main,/async resumePendingInvite\(\)/);
  assert.match(main,/if\(pendingInvite\.locked\)/);
  assert.match(main,/await joinPartnerRoom\(\)/);
  assert.match(ui,/if\(session&&bridge\.hasPendingInvite\?\.\(\)\)/);
  assert.match(ui,/await bridge\.resumePendingInvite\(\)/);
});
test('accepted shared journeys are indexed under the recipient account',()=>{
  const main=readFileSync('app.js','utf8');
  const ui=readFileSync('account-ui.js','utf8');
  assert.match(main,/TabiAccountUI\?\.addInvitedRoom\?\.\(invite\.roomId\)/);
  assert.match(ui,/function addInvitedRoom\(roomId\)/);
  assert.match(ui,/skipIds\.delete\(trip\.id\)/);
  assert.match(ui,/notifyTripChange\(\)/);
});
