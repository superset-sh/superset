import { Injectable } from "@nestjs/common";
import type { SnsPlatform } from "@superbuilder/drizzle";

@Injectable()
export class UtmService {
  /**
   * UTM 파라미터 생성
   */
  generateUtm(
    platform: SnsPlatform,
    campaignSlug?: string,
    contentId?: string,
  ): Record<string, string> {
    const utm: Record<string, string> = {
      utm_source: platform,
      utm_medium: "social",
    };

    if (campaignSlug) {
      utm.utm_campaign = campaignSlug;
    }

    if (contentId) {
      utm.utm_content = contentId;
    }

    return utm;
  }

  /**
   * URL에 UTM 쿼리 파라미터 추가
   */
  appendUtmToUrl(
    url: string,
    utm: Record<string, string>,
  ): string {
    try {
      const urlObj = new URL(url);
      for (const [key, value] of Object.entries(utm)) {
        urlObj.searchParams.set(key, value);
      }
      return urlObj.toString();
    } catch {
      // URL 파싱 실패 시 원본 반환
      return url;
    }
  }

  /**
   * 본문 내 URL에 UTM 자동 첨부
   * 본문에서 http/https URL을 찾아 UTM 파라미터를 추가합니다.
   */
  appendUtmToBody(
    body: string,
    utm: Record<string, string>,
  ): string {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

    return body.replace(urlRegex, (matchedUrl) => {
      return this.appendUtmToUrl(matchedUrl, utm);
    });
  }
}
