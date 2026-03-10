import { registerAs } from "@nestjs/config";
import { z } from "zod";
import type { PaymentProviderName } from "../types/normalized.types";

// 활성 프로바이더의 키는 필수, 비활성 프로바이더의 키는 빈 문자열 허용
const paymentEnvSchema = z
  .object({
    activeProvider: z.enum(["lemon-squeezy", "polar", "inicis"]),

    // LemonSqueezy
    lemonSqueezyApiKey: z.string(),
    lemonSqueezyStoreId: z.string(),
    lemonSqueezyWebhookSecret: z.string(),

    // Polar
    polarAccessToken: z.string(),
    polarOrganizationId: z.string(),
    polarWebhookSecret: z.string(),

    // INICIS
    inicisMid: z.string(),
    inicisSignKey: z.string(),
    inicisHashKey: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.activeProvider === "lemon-squeezy") {
      if (!data.lemonSqueezyApiKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_LEMON_SQUEEZY_API_KEY is required when lemon-squeezy is active",
          path: ["lemonSqueezyApiKey"],
        });
      }
      if (!data.lemonSqueezyStoreId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_LEMON_SQUEEZY_STORE_ID is required when lemon-squeezy is active",
          path: ["lemonSqueezyStoreId"],
        });
      }
      if (!data.lemonSqueezyWebhookSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_LEMON_SQUEEZY_WEBHOOK_SECRET is required when lemon-squeezy is active",
          path: ["lemonSqueezyWebhookSecret"],
        });
      }
    }

    if (data.activeProvider === "polar") {
      if (!data.polarAccessToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_POLAR_ACCESS_TOKEN is required when polar is active",
          path: ["polarAccessToken"],
        });
      }
      if (!data.polarOrganizationId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_POLAR_ORG_ID is required when polar is active",
          path: ["polarOrganizationId"],
        });
      }
      if (!data.polarWebhookSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_POLAR_WEBHOOK_SECRET is required when polar is active",
          path: ["polarWebhookSecret"],
        });
      }
    }

    if (data.activeProvider === "inicis") {
      if (!data.inicisMid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_INICIS_MID is required when inicis is active",
          path: ["inicisMid"],
        });
      }
      if (!data.inicisSignKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_INICIS_SIGN_KEY is required when inicis is active",
          path: ["inicisSignKey"],
        });
      }
      if (!data.inicisHashKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYMENT_INICIS_HASH_KEY is required when inicis is active",
          path: ["inicisHashKey"],
        });
      }
    }
  });

export type PaymentConfig = z.infer<typeof paymentEnvSchema> & {
  activeProvider: PaymentProviderName;
};

export const paymentConfig = registerAs("payment", (): PaymentConfig => {
  const config = {
    activeProvider: (process.env.PAYMENT_PROVIDER ?? "lemon-squeezy") as PaymentProviderName,

    // LemonSqueezy
    lemonSqueezyApiKey: process.env.PAYMENT_LEMON_SQUEEZY_API_KEY ?? "",
    lemonSqueezyStoreId: process.env.PAYMENT_LEMON_SQUEEZY_STORE_ID ?? "",
    lemonSqueezyWebhookSecret: process.env.PAYMENT_LEMON_SQUEEZY_WEBHOOK_SECRET ?? "",

    // Polar
    polarAccessToken: process.env.PAYMENT_POLAR_ACCESS_TOKEN ?? "",
    polarOrganizationId: process.env.PAYMENT_POLAR_ORG_ID ?? "",
    polarWebhookSecret: process.env.PAYMENT_POLAR_WEBHOOK_SECRET ?? "",

    // INICIS
    inicisMid: process.env.PAYMENT_INICIS_MID ?? "",
    inicisSignKey: process.env.PAYMENT_INICIS_SIGN_KEY ?? "",
    inicisHashKey: process.env.PAYMENT_INICIS_HASH_KEY ?? "",
  };

  const result = paymentEnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid payment configuration: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  return result.data;
});
