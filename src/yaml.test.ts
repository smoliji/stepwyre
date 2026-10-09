import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from './yaml.js';

test('block scalar keeps blank lines, strips common indent, ends with newline', () => {
  const doc = ['script: |', '  echo a', '', '  echo b'].join('\n');
  assert.deepEqual(parseYaml(doc), { script: 'echo a\n\necho b\n' });
});

test('block scalar with |- drops the trailing newline', () => {
  const doc = ['script: |-', '  echo a', '  echo b'].join('\n');
  assert.deepEqual(parseYaml(doc), { script: 'echo a\necho b' });
});

test('inline comments strip after whitespace, never inside urls or quotes', () => {
  assert.deepEqual(parseYaml('key: value # comment'), { key: 'value' });
  assert.deepEqual(parseYaml('url: http://x#frag'), { url: 'http://x#frag' });
  assert.deepEqual(parseYaml('key: "a # b"'), { key: 'a # b' });
});

test('single-quoted scalar unescapes doubled quotes', () => {
  assert.deepEqual(parseYaml("key: 'it''s'"), { key: "it's" });
});

test('CRLF document parses identically to LF', () => {
  const lines = ['name: a', 'script: |', '  echo hi', 'items:', '  - x', '  - y'];
  assert.deepEqual(parseYaml(lines.join('\r\n')), parseYaml(lines.join('\n')));
});

test('top-level sequence of scalars', () => {
  assert.deepEqual(parseYaml('- a\n- b'), ['a', 'b']);
});

test('inline-dash mapping items continue at item indent', () => {
  const doc = ['- name: a', '  script: echo a', '- name: b', '  script: echo b'].join('\n');
  assert.deepEqual(parseYaml(doc), [
    { name: 'a', script: 'echo a' },
    { name: 'b', script: 'echo b' },
  ]);
});

test('nested sequence tolerates blank and comment lines between items', () => {
  const doc = ['steps:', '', '  # first', '  - a', '', '  # second', '  - b'].join('\n');
  assert.deepEqual(parseYaml(doc), { steps: ['a', 'b'] });
});

test('empty and comments-only documents return null', () => {
  assert.equal(parseYaml(''), null);
  assert.equal(parseYaml('# just a comment\n\n# another'), null);
});

test('empty value followed by deeper keys yields a nested mapping', () => {
  const doc = ['parent:', '  child: x', '  other: y'].join('\n');
  assert.deepEqual(parseYaml(doc), { parent: { child: 'x', other: 'y' } });
});

test('empty value followed by dash lines yields a sequence', () => {
  const doc = ['items:', '- a', '- b'].join('\n');
  assert.deepEqual(parseYaml(doc), { items: ['a', 'b'] });
});
