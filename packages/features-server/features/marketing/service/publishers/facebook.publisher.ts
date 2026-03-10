import type { MarketingPlatformVariant, MarketingSnsAccount } from "@superbuilder/drizzle";
import type { PlatformConstraints, PublishResult } from "../../types";
import type { SnsPublisher } from "./publisher.interface";

export class FacebookPublisher implements SnsPublisher {
  readonly platform = "facebook" as const;

  /**
   * Facebook에 콘텐츠 발행
   * TODO: Facebook Graph API 연동 구현
   */
  async publish(
    _variant: MarketingPlatformVariant,
    _account: MarketingSnsAccount,
  ): Promise<PublishResult> {
    // TODO: Facebook Graph API를 사용한 실제 발행 구현
    // POST /{page-id}/feed (텍스트), POST /{page-id}/photos (이미지)
    return {
      success: true,
      platformPostId: `fb_stub_${Date.now()}`,
      platformPostUrl: `https://facebook.com/posts/stub_${Date.now()}`,
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

    if (body.length > 63206) {
      errors.push(`본문이 ${body.length}자입니다. 최대 63,206자까지 가능합니다.`);
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
      platform: "facebook",
      maxCharacters: 63206,
      maxImages: 10,
      requiresImage: false,
      supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "video/mp4"],
      maxHashtags: 30,
      recommendedImageSize: "1200x628",
    };
  }
}
