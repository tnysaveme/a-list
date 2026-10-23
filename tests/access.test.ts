import test from 'node:test';
import assert from 'node:assert/strict';
import {emailIsAllowed} from '../lib/access';

test('the owner and invited members can sign in with their own email addresses',()=>{
 const lists=['owner@example.com','first@example.com, SECOND@example.com, third@example.com'];
 for(const email of ['owner@example.com','first@example.com','second@example.com','third@example.com',' SECOND@example.com '])assert.equal(emailIsAllowed(email,lists),true);
 assert.equal(emailIsAllowed('owner@example.com',['owner@example.com',undefined]),true,'existing owner-only configuration remains valid');
});
test('access fails closed for uninvited users and partial or lookalike addresses',()=>{
 const lists=['owner@example.com','friend@example.com'];
 for(const email of ['stranger@example.com','friend@example.com.evil.test','friend+other@example.com','owner@example.co','@example.com','',null,undefined])assert.equal(emailIsAllowed(email,lists),false);
 assert.equal(emailIsAllowed('friend@example.com',[undefined,' , ']),false);
 assert.equal(emailIsAllowed('friend@example.com',['owner@example.com',undefined]),false,'removing an invite also denies the next authenticated request');
});
test('explicitly enabled email signups let new people use the same form without pre-registration',()=>{
 assert.equal(emailIsAllowed('new.person@example.com',['owner@example.com'],true),true);
 assert.equal(emailIsAllowed('new.person@example.com',[undefined],true),true);
 assert.equal(emailIsAllowed('new.person@example.com',['owner@example.com']),false);
 for(const email of [null,undefined,'','no-domain','two@@example.com','someone@example.com\r\nBcc:other@example.com'])assert.equal(emailIsAllowed(email,[],true),false);
});
