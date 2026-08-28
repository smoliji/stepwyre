import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMouse } from './mouse.js';

test('parses left-button press to 0-based click', () => {
  assert.deepEqual(parseMouse('\x1b[<0;5;12M'), [{ kind: 'click', x: 4, y: 11 }]);
});

test('ignores button release', () => {
  assert.deepEqual(parseMouse('\x1b[<0;5;12m'), []);
});

test('parses wheel up/down', () => {
  assert.deepEqual(parseMouse('\x1b[<64;1;1M'), [{ kind: 'wheel', delta: -3 }]);
  assert.deepEqual(parseMouse('\x1b[<65;1;1M'), [{ kind: 'wheel', delta: 3 }]);
});

test('parses multiple actions in one chunk, ignores other input', () => {
  const actions = parseMouse('junk\x1b[<0;1;1Mmore\x1b[<65;2;2M');
  assert.equal(actions.length, 2);
});

test('ignores drag/move and other buttons', () => {
  assert.deepEqual(parseMouse('\x1b[<32;5;5M'), []); // motion with button held
  assert.deepEqual(parseMouse('\x1b[<2;5;5M'), []);  // right button
});

test('does not match bracket text without the escape byte', () => {
  assert.deepEqual(parseMouse('[<0;5;12M'), []);
});
