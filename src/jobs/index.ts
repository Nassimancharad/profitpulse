import crypto from "node:crypto";

export type JobRun = {
  id: string;
  name: string;
  scope: string;
  idempotencyKey: string;
  cursor: string | null;
  startedAt: Date;
};

export function buildIdempotencyKey(parts: Array<string | number | null | undefined>) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

/**
 * Shared jobs helper. This is the single entry point for ingestion job metadata.
 * Backed by in-process state for now; can be swapped to a jobs table without route changes.
 */
export function startJobRun(input: {
  name: string;
  scope: string;
  cursor?: string | null;
  idempotencyKey: string;
}): JobRun {
  const run: JobRun = {
    id: crypto.randomUUID(),
    name: input.name,
    scope: input.scope,
    idempotencyKey: input.idempotencyKey,
    cursor: input.cursor ?? null,
    startedAt: new Date(),
  };

  return run;
}

export function finishJobRun(_run: JobRun, _status: "ok" | "error") {
  // Intentionally no-op until jobs table is introduced.
}
