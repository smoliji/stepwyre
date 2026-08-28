import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonLog } from './jsonLog.js';

test('parses pino-style line: msg key, numeric level', () => {
  const log = parseJsonLog('{"level":30,"time":123,"msg":"listening"}');
  assert.equal(log?.message, 'listening');
  assert.equal(log?.severity, 'info');
  assert.equal(log?.pretty, JSON.stringify({ level: 30, time: 123, msg: 'listening' }, null, 2));
});

test('message key fallback and severity mapping', () => {
  assert.equal(parseJsonLog('{"message":"hi"}')?.message, 'hi');
  assert.equal(parseJsonLog('{"level":50,"msg":"boom"}')?.severity, 'error');
  assert.equal(parseJsonLog('{"level":40,"msg":"careful"}')?.severity, 'warn');
  assert.equal(parseJsonLog('{"level":"fatal","msg":"x"}')?.severity, 'error');
  assert.equal(parseJsonLog('{"level":"warning","msg":"x"}')?.severity, 'warn');
});

test('object without msg/message uses compact JSON as message', () => {
  assert.equal(parseJsonLog('{"a":1}')?.message, '{"a":1}');
});

test('rejects non-JSON, arrays, primitives, and non-braced lines', () => {
  assert.equal(parseJsonLog('plain text'), undefined);
  assert.equal(parseJsonLog('[1,2]'), undefined);
  assert.equal(parseJsonLog('{broken'), undefined);
  assert.equal(parseJsonLog('{"unterminated": '), undefined);
});

test('tolerates surrounding whitespace', () => {
  assert.equal(parseJsonLog('  {"msg":"x"}  ')?.message, 'x');
});
