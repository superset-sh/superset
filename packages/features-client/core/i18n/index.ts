// i18n 인스턴스 생성
export { createI18n, getOrCreateI18n, getI18n } from "./create-i18n";

// 번역 훅 및 함수
export { useFeatureTranslation } from "./use-feature-translation";
export { getTranslation } from "./get-translation";

// 타입
export type {
  Language,
  TranslationResources,
  I18nResources,
  I18nConfig,
  I18nInstance,
} from "./types";

// react-i18next에서 필요한 것들 re-export
export { I18nextProvider, useTranslation } from "react-i18next";
