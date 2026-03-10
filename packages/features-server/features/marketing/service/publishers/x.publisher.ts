import type { MarketingPlatformVariant, MarketingSnsAccount } from "@superbuilder/drizzle";
import type { PlatformConstraints, PublishResult } from "../../types";
import type { SnsPublisher } from "./publisher.interface";

export class XPublisher implements SnsPublisher {
  readonly platform = "x" as const;

  /**
   * X (Twitter)에 콘텐츠 발행
   * TODO: X API v2 연동 구현
   */
  async publish(
    _variant: MarketingPlatformVariant,
    _account: MarketingSnsAccount,
  ): Promise<PublishResult> {
    // TODO: X API v2를 사용한 실제 발행 구현
    // POST /2/tweets (텍스트 + 미디어)
    return {
      success: true,
      platformPostId: `x_stub_${Date.now()}`,
      platformPostUrl: `https://x.com/user/status/stub_${Date.now()}`,
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

    if (body.length > 280) {
      errors.push(`본문이 ${body.length}자입니다. 최대 280자까지 가능합니다.`);
    }

    if (images.length > 4) {
      errors.push(`이미지가 ${images.length}개입니다. 최대 4개까지 가능합니다.`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 플랫폼 제약사항
   */
  getConstraints(): PlatformConstraints {
    return {
      platform: "x",
      maxCharacters: 280,
      maxImages: 4,
      requiresImage: false,
      supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "video/mp4"],
      maxHashtags: 10,
      recommendedImageSize: "1200x675",
    };
  }
}
