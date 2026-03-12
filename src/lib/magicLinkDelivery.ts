type MagicLinkDeliveryInput = {
  email: string;
  magicLinkUrl: string | null;
  expiresAt: Date | null;
};

type MagicLinkDeliveryResult = {
  mode: "preview" | "disabled";
  previewUrl: string | null;
};

function resolveDeliveryMode() {
  const configured = process.env.MAGIC_LINK_DELIVERY_MODE?.trim().toLowerCase();
  if (configured === "disabled") return "disabled" as const;
  return "preview" as const;
}

export async function deliverMagicLink(input: MagicLinkDeliveryInput): Promise<MagicLinkDeliveryResult> {
  void input.email;
  void input.expiresAt;

  if (resolveDeliveryMode() === "disabled") {
    return {
      mode: "disabled",
      previewUrl: null,
    };
  }

  // Phase 1: preview delivery only. Replace this adapter with Resend/Postmark/SendGrid later.
  return {
    mode: "preview",
    previewUrl: input.magicLinkUrl,
  };
}
