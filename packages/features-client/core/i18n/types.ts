import type { i18n } from "i18next";

/**
 * 지원하는 언어 코드
 */
export type Language = "ko" | "en";

/**
 * Namespace별 번역 리소스
 */
export type TranslationResources = Record<string, Record<string, string>>;

/**
 * 언어별 번역 리소스
 */
export type I18nResources = Record<Language, TranslationResources>;

/**
 * i18n 설정 옵션
 */
export interface I18nConfig {
  /**
   * 기본 언어
   * @default 'ko'
   */
  defaultLanguage?: Language;

  /**
   * 폴백 언어
   * @default 'ko'
   */
  fallbackLanguage?: Language;

  /**
   * 번역 리소스
   */
  resources: I18nResources;

  /**
   * 디버그 모드
   * @default false
   */
  debug?: boolean;
}

/**
 * i18n 인스턴스 타입
 */
export type I18nInstance = i18n;
