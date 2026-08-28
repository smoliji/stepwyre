export function parseYaml(text: string): unknown {
  const lines = text.split(/\r\n|\r|\n/);
  let i = 0;

  const indentOf = (line: string): number => line.length - line.trimStart().length;
  const isBlank = (line: string): boolean => line.trim() === '';
  const isComment = (line: string): boolean => line.trimStart().startsWith('#');
  const skippable = (line: string): boolean => isBlank(line) || isComment(line);
  const isDash = (content: string): boolean => content === '-' || content.startsWith('- ');

  const skip = (): void => {
    while (i < lines.length && skippable(lines[i]!)) i++;
  };

  const stripInlineComment = (value: string): string => {
    let quote: string | null = null;
    for (let idx = 0; idx < value.length; idx++) {
      const char = value[idx];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === '#' && (idx === 0 || value[idx - 1] === ' ' || value[idx - 1] === '\t')) {
        return value.slice(0, idx).trimEnd();
      }
    }
    return value;
  };

  const unquoteScalar = (value: string): string => {
    const quote = value[0];
    if ((quote === "'" || quote === '"') && value.length >= 2 && value.endsWith(quote)) {
      const inner = value.slice(1, -1);
      return quote === "'" ? inner.replaceAll("''", "'") : inner;
    }
    return value;
  };

  const parseScalar = (value: string): string => unquoteScalar(stripInlineComment(value));

  const splitKey = (content: string): [string, string] | null => {
    for (let idx = 0; idx < content.length; idx++) {
      if (content[idx] === ':' && (idx + 1 === content.length || content[idx + 1] === ' ')) {
        return [content.slice(0, idx).trim(), content.slice(idx + 1)];
      }
    }
    return null;
  };

  const parseBlockScalar = (keyIndent: number, strip: boolean): string => {
    const raw: string[] = [];
    while (i < lines.length) {
      const line = lines[i]!;
      if (isBlank(line)) {
        raw.push('');
        i++;
        continue;
      }
      if (indentOf(line) <= keyIndent) break;
      raw.push(line);
      i++;
    }
    while (raw.length && raw[raw.length - 1] === '') raw.pop();
    if (raw.length === 0) return '';
    const base = Math.min(...raw.filter((line) => line !== '').map(indentOf));
    const body = raw.map((line) => (line === '' ? '' : line.slice(base))).join('\n');
    return strip ? body : body + '\n';
  };

  const parseSequence = (indent: number): unknown[] => {
    const items: unknown[] = [];
    while (i < lines.length) {
      skip();
      if (i >= lines.length) break;
      const line = lines[i]!;
      if (indentOf(line) !== indent) break;
      const content = line.slice(indent);
      if (!isDash(content)) break;
      const afterDash = content.slice(1);
      const inline = afterDash.trim();
      if (inline === '') {
        i++;
        items.push(parseNested(indent));
        continue;
      }
      const spaces = afterDash.length - afterDash.trimStart().length;
      const itemIndent = indent + 1 + spaces;
      if (splitKey(inline)) {
        lines[i] = ' '.repeat(itemIndent) + inline;
        items.push(parseMapping(itemIndent));
      } else {
        i++;
        items.push(parseScalar(inline));
      }
    }
    return items;
  };

  const parseNested = (parentIndent: number): unknown => {
    skip();
    if (i >= lines.length) return null;
    const line = lines[i]!;
    const indent = indentOf(line);
    const content = line.slice(indent);
    if (isDash(content) && indent >= parentIndent) return parseSequence(indent);
    if (indent > parentIndent) return parseMapping(indent);
    return null;
  };

  function parseMapping(indent: number): Record<string, unknown> {
    const map: Record<string, unknown> = {};
    while (i < lines.length) {
      skip();
      if (i >= lines.length) break;
      const line = lines[i]!;
      if (indentOf(line) !== indent) break;
      const content = line.slice(indent);
      if (isDash(content)) break;
      const parts = splitKey(content);
      if (!parts) break;
      const [key, rest] = parts;
      i++;
      const value = stripInlineComment(rest.trim());
      if (value === '|' || value === '|-') {
        map[key] = parseBlockScalar(indent, value === '|-');
      } else if (value === '') {
        map[key] = parseNested(indent);
      } else {
        map[key] = unquoteScalar(value);
      }
    }
    return map;
  }

  skip();
  if (i >= lines.length) return null;
  const first = lines[i]!;
  const indent = indentOf(first);
  return isDash(first.slice(indent)) ? parseSequence(indent) : parseMapping(indent);
}
