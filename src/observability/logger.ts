type LogLevel = "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

function sanitize(payload: LogPayload | undefined) {
  if (!payload) return undefined;
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return { note: "payload_not_serializable" };
  }
}

function write(level: LogLevel, message: string, payload?: LogPayload) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    payload: sanitize(payload),
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(entry));
    return;
  }

  console.log(JSON.stringify(entry));
}

export function logInfo(message: string, payload?: LogPayload) {
  write("info", message, payload);
}

export function logWarn(message: string, payload?: LogPayload) {
  write("warn", message, payload);
}

export function logError(message: string, payload?: LogPayload) {
  write("error", message, payload);
}
