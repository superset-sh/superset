import type { MarketingPlatformVariant, MarketingSnsAccount } from "@superbuilder/drizzle";
import type { PlatformConstraints, PublishResult } from "../../types";
import type { SnsPublisher } from "./publisher.interface";

export class InstagramPublisher implements SnsPublisher {
  readonly platform = "instagram" as const;

  /**
   * Instagram에 콘텐츠 발행
   * TODO: Instagram Graph API 연동 구현
   */
  async publish(
    _variant: MarketingPlatformVariant,
    _account: MarketingSnsAccount,
  ): Promise<PublishResult> {
    // TODO: Instagram Graph API를 사용한 실제 발행 구현
    // POST /{ig-user-id}/media → POST /{ig-user-id}/media_publish
    return {
      success: true,
      platformPostId: `ig_stub_${Date.now()}`,
      platformPostUrl: `https://instagram.com/p/stub_${Date.now()}`,
    };
  }

  /**
   * 콘텐츠 유효성 검증
   */
  validateContent(
    body: string,
    images: string[],
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (body.length > 2200) {
      errors.push(`본문이 ${body.length}자입니다. 최대 2,200자까지 가능합니다.`);
    }

    if (images.length === 0) {
      errors.push("Instagram은 최소 1개의 이미지가 필요합니다.");
    }

    if (images.length > 10) {
      errors.push(`이미지가 ${images.length}개입니다. 최대 10개까지 가능합니다.`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 플랫폼 제약사항
   */
  getConstraints(): PlatformConstraints {
    return {
      platform: "instagram",
      maxCharacters: 2200,
      maxImages: 10,
      requiresImage: true,
      supportedMediaTypes: ["image/jpeg", "image/png", "video/mp4"],
      maxHashtags: 30,
      recommendedImageSize: "1080x1080",
    };
  }
}
