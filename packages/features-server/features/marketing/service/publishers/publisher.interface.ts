import type { MarketingPlatformVariant, MarketingSnsAccount, SnsPlatform } from "@superbuilder/drizzle";
import type { PlatformConstraints, PublishResult } from "../../types";

export interface SnsPublisher {
  readonly platform: SnsPlatform;
  publish(variant: MarketingPlatformVariant, account: MarketingSnsAccount): Promise<PublishResult>;
  validateContent(body: string, images: string[]): { valid: boolean; errors: string[] };
  getConstraints(): PlatformConstraints;
}
