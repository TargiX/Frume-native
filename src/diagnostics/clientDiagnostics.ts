import AsyncStorage from '@react-native-async-storage/async-storage';

export const CLIENT_DIAGNOSTICS_STORAGE_KEY = '@frume/client-diagnostics';
export const MAX_CLIENT_DIAGNOSTICS = 10;

export type ClientDiagnosticKind =
  | 'render_error'
  | 'global_js_error'
  | 'haptic_error';

export type ClientDiagnostic = {
  version: 1;
  id: string;
  occurredAt: number;
  kind: ClientDiagnosticKind;
  fatal: boolean;
  errorName: string;
  componentNames: string[];
};

export type ClientDiagnosticsStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type RecordClientDiagnosticInput = {
  kind: ClientDiagnosticKind;
  error: unknown;
  fatal?: boolean;
  componentStack?: string | null;
  occurredAt?: number;
};

let diagnosticSequence = 0;
const MAX_JAVASCRIPT_DATE_MS = 8_640_000_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeErrorName(error: unknown): string {
  const candidate =
    error instanceof Error
      ? error.name
      : isRecord(error) && typeof error.name === 'string'
        ? error.name
        : 'Error';
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate)
    ? candidate
    : 'Error';
}

export function extractComponentNames(
  componentStack?: string | null,
): string[] {
  if (!componentStack) {
    return [];
  }

  const names: string[] = [];
  const matcher = /(?:^|\n)\s*(?:in|at)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  for (const match of componentStack.matchAll(matcher)) {
    const name = match[1];
    if (!names.includes(name)) {
      names.push(name);
    }
    if (names.length === 8) {
      break;
    }
  }
  return names;
}

function isClientDiagnostic(value: unknown): value is ClientDiagnostic {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.id === 'string' &&
    /^[a-z0-9-]{3,40}$/.test(value.id) &&
    Number.isSafeInteger(value.occurredAt) &&
    (value.occurredAt as number) >= 0 &&
    (value.occurredAt as number) <= MAX_JAVASCRIPT_DATE_MS &&
    (value.kind === 'render_error' ||
      value.kind === 'global_js_error' ||
      value.kind === 'haptic_error') &&
    typeof value.fatal === 'boolean' &&
    typeof value.errorName === 'string' &&
    /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value.errorName) &&
    Array.isArray(value.componentNames) &&
    value.componentNames.length <= 8 &&
    value.componentNames.every(
      (name) =>
        typeof name === 'string' &&
        /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(name),
    )
  );
}

export function deserializeClientDiagnostics(
  serialized: string | null,
): ClientDiagnostic[] {
  if (!serialized) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isClientDiagnostic).slice(-MAX_CLIENT_DIAGNOSTICS);
  } catch {
    return [];
  }
}

function createDiagnostic({
  kind,
  error,
  fatal = false,
  componentStack,
  occurredAt = Date.now(),
}: RecordClientDiagnosticInput): ClientDiagnostic {
  diagnosticSequence = (diagnosticSequence + 1) % 46_656;
  return {
    version: 1,
    id: `${occurredAt.toString(36)}-${diagnosticSequence.toString(36)}`,
    occurredAt,
    kind,
    fatal,
    errorName: safeErrorName(error),
    componentNames: extractComponentNames(componentStack),
  };
}

export class ClientDiagnosticsStore {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: ClientDiagnosticsStorage = AsyncStorage,
  ) {}

  async load(): Promise<ClientDiagnostic[]> {
    try {
      return deserializeClientDiagnostics(
        await this.storage.getItem(CLIENT_DIAGNOSTICS_STORAGE_KEY),
      );
    } catch {
      return [];
    }
  }

  record(input: RecordClientDiagnosticInput): Promise<boolean> {
    const diagnostic = createDiagnostic(input);
    const write = this.writeQueue.then(async () => {
      try {
        const existing = await this.load();
        const next = [...existing, diagnostic].slice(-MAX_CLIENT_DIAGNOSTICS);
        await this.storage.setItem(
          CLIENT_DIAGNOSTICS_STORAGE_KEY,
          JSON.stringify(next),
        );
        return true;
      } catch {
        return false;
      }
    });
    this.writeQueue = write.catch(() => undefined);
    return write;
  }

  async clear(): Promise<boolean> {
    try {
      await this.writeQueue;
      await this.storage.removeItem(CLIENT_DIAGNOSTICS_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

export function buildClientDiagnosticsReport(
  diagnostics: readonly ClientDiagnostic[],
  appVersion: string,
  nativeBuild?: string,
): string {
  const version = nativeBuild
    ? `${appVersion} (${nativeBuild})`
    : appVersion;
  const lines = diagnostics.map((diagnostic) => {
    const components = diagnostic.componentNames.length
      ? ` components=${diagnostic.componentNames.join('>')}`
      : '';
    return [
      diagnostic.id,
      new Date(diagnostic.occurredAt).toISOString(),
      diagnostic.kind,
      diagnostic.fatal ? 'fatal' : 'nonfatal',
      diagnostic.errorName,
    ].join(' ') + components;
  });

  return [
    'Frume redacted diagnostics',
    `App ${version}`,
    ...lines,
    '',
    'No photos, URLs, exception messages, stack traces, user names, or device identifiers are included.',
  ].join('\n');
}

export const clientDiagnostics = new ClientDiagnosticsStore();
