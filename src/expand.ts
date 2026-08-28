import type { BootStep, Lifecycle } from './config.js';
import { freePort } from './freePort.js';

export interface ResolvedStep {
  name: string;
  script: string;
  lifecycle: Lifecycle;
  logs: 'json' | undefined;
  props: Record<string, string>;
}

export type Registry = Record<string, Record<string, string>>;

function unquote(term: string): string | undefined {
  const quote = term[0];
  if ((quote === "'" || quote === '"') && term.length >= 2 && term.endsWith(quote)) {
    return term.slice(1, -1);
  }
  return undefined;
}

function splitTerms(token: string): string[] {
  const terms: string[] = [];
  let cursor = 0;
  while (cursor < token.length) {
    while (token[cursor] === ' ') cursor++;
    if (cursor >= token.length) break;

    const quote = token[cursor];
    if (quote === "'" || quote === '"') {
      const end = token.indexOf(quote, cursor + 1);
      if (end === -1) {
        throw new Error(`unterminated quote in token '${token}'`);
      }
      terms.push(token.slice(cursor, end + 1));
      cursor = end + 1;
    } else {
      let separator = token.indexOf('??', cursor);
      if (separator === -1) separator = token.length;
      const term = token.slice(cursor, separator).trim();
      if (term !== '') terms.push(term);
      cursor = separator;
    }

    while (token[cursor] === ' ') cursor++;
    if (token.startsWith('??', cursor)) cursor += 2;
  }
  return terms;
}

function addressable(term: string, registry: Registry): boolean {
  if (term === 'FREE_PORT') return true;
  const dot = term.indexOf('.');
  if (dot === -1) return false;
  const ref = term.slice(0, dot);
  return ref === 'ENV' || registry[ref] !== undefined;
}

async function resolveTerm(
  term: string,
  self: Record<string, string>,
  registry: Registry,
  env: Record<string, string>,
): Promise<string | undefined> {
  if (term === 'FREE_PORT') {
    return String(await freePort());
  }

  const dot = term.indexOf('.');
  if (dot !== -1) {
    const ref = term.slice(0, dot);
    const prop = term.slice(dot + 1);
    if (ref === 'ENV') {
      return env[prop] ?? '';
    }
    return registry[ref]?.[prop];
  }

  return self[term];
}

async function resolveToken(
  token: string,
  self: Record<string, string>,
  registry: Registry,
  env: Record<string, string>,
): Promise<string> {
  const terms = splitTerms(token);
  let sawEmpty = false;
  for (const [index, term] of terms.entries()) {
    const literal = unquote(term);
    if (literal !== undefined) {
      if (literal !== '') return literal;
      sawEmpty = true;
      continue;
    }

    const value = await resolveTerm(term, self, registry, env);
    if (value !== undefined && value !== '') {
      return value;
    }
    if (value === '') {
      sawEmpty = true;
      continue;
    }

    if (index > 0 && !addressable(term, registry)) {
      return term;
    }
  }
  if (sawEmpty) return '';
  throw new Error(`unresolved token '${token}'`);
}

async function expand(
  value: string,
  self: Record<string, string>,
  registry: Registry,
  env: Record<string, string>,
): Promise<string> {
  let result = '';
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf('${', cursor);
    if (start === -1) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, start);
    const end = value.indexOf('}', start + 2);
    if (end === -1) {
      result += value.slice(start);
      break;
    }
    const token = value.slice(start + 2, end);
    result += await resolveToken(token, self, registry, env);
    cursor = end + 1;
  }
  return result;
}

export async function resolveStep(
  step: BootStep,
  registry: Registry,
  env: Record<string, string>,
): Promise<ResolvedStep> {
  const self: Record<string, string> = {};
  for (const key of Object.keys(step)) {
    self[key] = await expand(String(step[key]), self, registry, env);
  }
  return {
    name: self.name!,
    script: self.script!,
    lifecycle: step.lifecycle,
    logs: step.logs,
    props: self,
  };
}
