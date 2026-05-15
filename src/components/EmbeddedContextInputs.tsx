import type { EmbeddedAppContext } from "@/lib/embeddedAppContext";

type EmbeddedContextInputsProps = {
  context: EmbeddedAppContext;
};

export function EmbeddedContextInputs({ context }: EmbeddedContextInputsProps) {
  return (
    <>
      {context.host ? <input type="hidden" name="host" value={context.host} /> : null}
      {context.embedded ? <input type="hidden" name="embedded" value={context.embedded} /> : null}
    </>
  );
}
