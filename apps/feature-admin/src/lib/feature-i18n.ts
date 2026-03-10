/**
 * Feature i18n
 *
 * 🤖 ATLAS CLI MANAGED
 * Feature 추가/제거 시 CLI가 이 파일을 업데이트합니다
 */
import { getOrCreateI18n } from "@superbuilder/features-client/core/i18n";
// Feature locale imports
// [ATLAS:LOCALES_IMPORTS]
import * as authLocales from "../features/auth/locales";
import * as marketingLocales from "../features/marketing/locales";

// [/ATLAS:LOCALES_IMPORTS]

export const i18n = getOrCreateI18n({
  defaultLanguage: "ko",
  fallbackLanguage: "en",
  resources: {
    ko: {
      // [ATLAS:LOCALES_KO]
      auth: authLocales.ko,
      marketing: marketingLocales.ko,
      // [/ATLAS:LOCALES_KO]
    },
    en: {
      // [ATLAS:LOCALES_EN]
      auth: authLocales.en,
      marketing: marketingLocales.en,
      // [/ATLAS:LOCALES_EN]
    },
  },
  debug: import.meta.env.DEV,
});
