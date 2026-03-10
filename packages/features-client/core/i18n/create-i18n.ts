import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { I18nConfig, I18nInstance, Language } from "./types";

const DEFAULT_LANGUAGE: Language = "ko";

/**
 * i18n 인스턴스를 생성합니다.
 *
 * @example
 * ```tsx
 * // app/i18n.ts
 * import { createI18n } from '@/core/i18n';
 * import authKo from '@/features/auth/locales/ko.json';
 * import authEn from '@/features/auth/locales/en.json';
 *
 * export const i18n = createI18n({
 *   defaultLanguage: 'ko',
 *   resources: {
 *     ko: { auth: authKo },
 *     en: { auth: authEn },
 *   },
 * });
 *
 * // main.tsx
 * import { i18n } from './i18n';
 * import { I18nextProvider } from 'react-i18next';
 *
 * <I18nextProvider i18n={i18n}>
 *   <App />
 * </I18nextProvider>
 * ```
 */
export function createI18n(config: I18nConfig): I18nInstance {
  const {
    defaultLanguage = DEFAULT_LANGUAGE,
    fallbackLanguage = DEFAULT_LANGUAGE,
    resources,
    debug = false,
  } = config;

  const instance = i18n.createInstance();

  instance.use(initReactI18next).init({
    resources,
    lng: defaultLanguage,
    fallbackLng: fallbackLanguage,
    debug,
    interpolation: {
      escapeValue: false, // React는 XSS를 자동으로 처리함
    },
    react: {
      useSuspense: false, // SSR 호환성을 위해 비활성화
    },
  });

  return instance;
}

/**
 * 단일 i18n 인스턴스를 생성하고 반환합니다. (싱글톤 패턴)
 * 이미 생성된 인스턴스가 있으면 해당 인스턴스를 반환합니다.
 */
let globalInstance: I18nInstance | null = null;

export function getOrCreateI18n(config: I18nConfig): I18nInstance {
  if (!globalInstance) {
    globalInstance = createI18n(config);
  }
  return globalInstance;
}

/**
 * 전역 i18n 인스턴스를 반환합니다.
 * 인스턴스가 없으면 에러를 발생시킵니다.
 */
export function getI18n(): I18nInstance {
  if (!globalInstance) {
    throw new Error("i18n instance not initialized. Call getOrCreateI18n() first.");
  }
  return globalInstance;
}
