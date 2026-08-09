type LogLevel = "info" | "warn" | "error";

export interface LogDetail {
  [key: string]: unknown;
}

function writeLog(level: LogLevel, event: string, detail?: LogDetail): void {
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...detail,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(event: string, detail?: LogDetail): void {
  writeLog("info", event, detail);
}

export function logWarn(event: string, detail?: LogDetail): void {
  writeLog("warn", event, detail);
}

export function logError(event: string, detail?: LogDetail): void {
  writeLog("error", event, detail);
}
