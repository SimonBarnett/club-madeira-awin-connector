export const REDACTED = '[REDACTED]';

function stringify(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof Error) {
    const stack = input.stack ? `\n${input.stack}` : '';
    return `${input.name}: ${input.message}${stack}`;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function extraSecrets(explicit: string[]): string[] {
  const out = [...explicit];
  const envTok = process.env.AWIN_ACCESS_TOKEN;
  if (envTok) out.push(envTok);
  return [...new Set(out.filter((s) => s.length > 0))];
}

/** Replace bearer tokens and accessToken= query values. Never print raw secrets. */
export function redact(input: unknown, secrets: string[] = []): string {
  let text = stringify(input);
  for (const secret of extraSecrets(secrets)) {
    text = text.split(secret).join(REDACTED);
  }
  text = text.replace(/Bearer\s+\S+/gi, `Bearer ${REDACTED}`);
  text = text.replace(/accessToken=[^&\s"'\\]+/gi, `accessToken=${REDACTED}`);
  text = text.replace(/(Authorization\s*[:=]\s*)([^\r\n,]+)/gi, `$1${REDACTED}`);
  return text;
}

export class RedactedError extends Error {
  constructor(message: unknown, secrets: string[] = []) {
    super(redact(message, secrets));
    this.name = 'RedactedError';
  }
}

export function redactedError(message: unknown, secrets: string[] = []): RedactedError {
  return new RedactedError(message, secrets);
}

export function logRedacted(
  line: unknown,
  writer: (s: string) => void = console.error,
  secrets: string[] = [],
): void {
  writer(redact(line, secrets));
}
