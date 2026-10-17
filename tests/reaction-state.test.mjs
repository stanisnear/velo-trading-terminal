import test from 'node:test';
import assert from 'node:assert/strict';
import { setReactionActor } from '../src/services/reactionState.mjs';

test('reaction rollback preserves another actor joining or leaving via realtime', () => {
  assert.deepEqual(setReactionActor(['me', 'new-user'], 'me', false), ['new-user']);
  assert.deepEqual(setReactionActor(['new-user'], 'me', true), ['new-user', 'me']);
});

test('optimistic reactions and realtime acknowledgements cannot duplicate an actor', () => {
  const before = ['me', 'another', 'me'];
  assert.deepEqual(setReactionActor(before, 'me', true), ['another', 'me']);
  assert.deepEqual(before, ['me', 'another', 'me']);
});
