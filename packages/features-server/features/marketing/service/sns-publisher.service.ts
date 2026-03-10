import { Injectable, NotFoundException } from "@nestjs/common";
import type { MarketingPlatformVariant, MarketingSnsAccount, SnsPlatform } from "@superbuilder/drizzle";
import type { PlatformConstraints, PublishResult } from "../types";
import type { SnsPublisher } from "./publishers/publisher.interface";
import { FacebookPublisher } from "./publishers/facebook.publisher";
import { InstagramPublisher } from "./publishers/instagram.publisher";
import { ThreadsPublisher } from "./publishers/threads.publisher";
import { XPublisher } from "./publishers/x.publisher";
import { LinkedInPublisher } from "./publishers/linkedin.publisher";

@Injectable()
export class SnsPublisherService {
  private publishers: Map<SnsPlatform, SnsPublisher>;

  constructor() {
    this.publishers = new Map<SnsPlatform, SnsPublisher>([
      ["facebook", new FacebookPublisher()],
      ["instagram", new InstagramPublisher()],
      ["threads", new ThreadsPublisher()],
      ["x", new XPublisher()],
      ["linkedin", new LinkedInPublisher()],
    ]);
  }

  /**
   * 플랫폼에 콘텐츠 발행
   */
  async publish(
    platform: SnsPlatform,
    variant: MarketingPlatformVariant,
    account: MarketingSnsAccount,
  ): Promise<PublishResult> {
    const publisher = this.getPublisher(platform);
    return publisher.publish(variant, account);
  }

  /**
   * 콘텐츠 유효성 검증
   */
  validateContent(
    platform: SnsPlatform,
    body: string,
    images: string[],
  ): { valid: boolean; errors: string[] } {
    const publisher = this.getPublisher(platform);
    return publisher.validateContent(body, images);
  }

  /**
   * 특정 플랫폼의 제약사항 조회
   */
  getConstraints(platform: SnsPlatform): PlatformConstraints {
    const publisher = this.getPublisher(platform);
    return publisher.getConstraints();
  }

  /**
   * 모든 플랫폼 제약사항 조회
   */
  getAllConstraints(): PlatformConstraints[] {
    return Array.from(this.publishers.values()).map((p) => p.getConstraints());
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getPublisher(platform: SnsPlatform): SnsPublisher {
    const publisher = this.publishers.get(platform);
    if (!publisher) {
      throw new NotFoundException(`지원하지 않는 플랫폼입니다: ${platform}`);
    }
    return publisher;
  }
}
