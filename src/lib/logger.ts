export type LogFields = Record<string, string | number | boolean | null | undefined>;

function writeLog(level: 'info' | 'error', event: string, fields: LogFields): void {
  const entry = {
    ...fields,
    timestamp: new Date().toISOString(),
    level,
    event,
  };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, fields: LogFields = {}): void {
  writeLog('info', event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  writeLog('error', event, fields);
}
