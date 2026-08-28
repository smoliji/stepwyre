export interface JsonLogLike {
  message: string;
  severity: 'info' | 'warn' | 'error';
  pretty: string;
}

export interface LogEvent {
  step: string;
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  ts: number;
  json?: JsonLogLike;
}

export const MAX_LINE = 32768;

export class LineSplitter {
  private rest = '';

  push(chunk: string): string[] {
    this.rest += chunk;
    const lines: string[] = [];
    let start = 0;
    let newline: number;
    while ((newline = this.rest.indexOf('\n', start)) !== -1) {
      let line = this.rest.slice(start, newline);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      lines.push(line.slice(0, MAX_LINE));
      start = newline + 1;
    }
    this.rest = this.rest.slice(start);
    while (this.rest.length >= MAX_LINE) {
      lines.push(this.rest.slice(0, MAX_LINE));
      this.rest = this.rest.slice(MAX_LINE);
    }
    return lines;
  }

  flush(): string[] {
    if (this.rest === '') return [];
    const line = this.rest.slice(0, MAX_LINE);
    this.rest = '';
    return [line];
  }
}
