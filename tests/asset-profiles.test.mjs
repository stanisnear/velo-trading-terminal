import test from 'node:test';import assert from 'node:assert/strict';import {ASSET_PROFILES,assetProfile} from '../shared/assetProfiles.mjs';
// Current directory identities, not tickers (which can collide or change).
const directoryIds=[1,1027,825,1839,52,3408,5426,1958,1437,32196,74,328,3957,1975,2010,6535,512,1831,2,29470,4943,7083,37263,5805,36148,20947,11419,4642,33793,27772,5176,22974,5994,3635,30171,34387,35491,3155,3897,7278,21159,24478,36507,36341,4705,6636,33251,27075,39120,13502];
test('directory identities have concise sourced summaries, with no ticker-based substitutions',()=>{
 for(const id of directoryIds){const profile=assetProfile(id);assert.ok(profile,`Profile ${id}`);assert.ok(profile.description.length>100&&profile.description.length<=390,`Concise profile ${id}`);assert.match(profile.source,/^https:\/\//);assert.ok(profile.category);assert.doesNotMatch(profile.description,/is a cryptocurrency\s*\.|last 24 hours/i);}
 assert.equal(assetProfile('ZEC'),undefined);assert.equal(assetProfile(-1),undefined);assert.equal(assetProfile(99999999),undefined);assert.equal(assetProfile('1437'),ASSET_PROFILES[1437]);
 assert.match(assetProfile(1437).description,/shielded/);assert.match(assetProfile(29470).description,/derivatives/);assert.match(assetProfile(3408).description,/Circle/);
});
