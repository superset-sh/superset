import type { MarketingPlatformVariant, MarketingSnsAccount } from "@superbuilder/drizzle";
import type { PlatformConstraints, PublishResult } from "../../types";
import type { SnsPublisher } from "./publisher.interface";

export class LinkedInPublisher implements SnsPublisher {
  readonly platform = "linkedin" as const;

  /**
   * LinkedIn에 콘텐츠 발행
   * TODO: LinkedIn Marketing API 연동 구현
   */
  async publish(
    _variant: MarketingPlatformVariant,
    _account: MarketingSnsAccount,
  ): Promise<PublishResult> {
    // TODO: LinkedIn API를 사용한 실제 발행 구현
    // POST /ugcPosts (텍스트 + 미디어)
    return {
      success: true,
      platformPostId: `li_stub_${Date.now()}`,
      platformPostUrl: `https://linkedin.com/feed/update/stub_${Date.now()}`,
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

    if (body.length > 3000) {
      errors.push(`본문이 ${body.length}자입니다. 최대 3,000자까지 가능합니다.`);
    }

    if (images.length > 9) {
      errors.push(`이미지가 ${images.length}개입니다. 최대 9개까지 가능합니다.`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 플랫폼 제약사항
   */
  getConstraints(): PlatformConstraints {
    return {
      platform: "linkedin",
      maxCharacters: 3000,
      maxImages: 9,
      requiresImage: false,
      supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "video/mp4"],
      maxHashtags: 30,
      recommendedImageSize: "1200x628",
    };
  }
}
