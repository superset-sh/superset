import { Injectable, NotFoundException } from "@nestjs/common";
import type { MarketingContentDraft } from "../types";

/**
 * 다른 Feature의 콘텐츠를 마케팅 콘텐츠로 변환하는 어댑터 인터페이스
 *
 * 각 Feature에서 이 인터페이스를 구현하여 ContentAdapterService에 등록합니다.
 *
 * @example
 * ```typescript
 * class BoardPostAdapter implements ContentAdapter {
 *   sourceType = "board_post";
 *   async toMarketingDraft(sourceId: string) {
 *     const post = await boardService.findById(sourceId);
 *     return { title: post.title, body: post.content, ... };
 *   }
 * }
 * ```
 */
export interface ContentAdapter {
  readonly sourceType: string;
  toMarketingDraft(sourceId: string): Promise<MarketingContentDraft>;
}

@Injectable()
export class ContentAdapterService {
  private adapters = new Map<string, ContentAdapter>();

  /**
   * 어댑터 등록
   */
  registerAdapter(adapter: ContentAdapter): void {
    this.adapters.set(adapter.sourceType, adapter);
  }

  /**
   * 소스 콘텐츠로부터 마케팅 콘텐츠 초안 생성
   */
  async createDraft(
    sourceType: string,
    sourceId: string,
  ): Promise<MarketingContentDraft> {
    const adapter = this.adapters.get(sourceType);
    if (!adapter) {
      throw new NotFoundException(
        `소스 타입 "${sourceType}"에 대한 어댑터를 찾을 수 없습니다. 지원 타입: ${this.getSupportedTypes().join(", ")}`,
      );
    }
    return adapter.toMarketingDraft(sourceId);
  }

  /**
   * 지원하는 소스 타입 목록
   */
  getSupportedTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}
