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
import * as bookingLocales from "../features/booking/locales";
import * as marketingLocales from "../features/marketing/locales";
import * as agentDeskLocales from "../features/agent-desk/locales";
import * as courseLocales from "../features/course/locales";

// [/ATLAS:LOCALES_IMPORTS]

const LANG_STORAGE_KEY = "atlas_language";
const savedLang = (typeof window !== "undefined" && localStorage.getItem(LANG_STORAGE_KEY)) || "ko";

export const i18n = getOrCreateI18n({
  defaultLanguage: savedLang as "ko" | "en",
  fallbackLanguage: "en",
  resources: {
    ko: {
      // [ATLAS:LOCALES_KO]
      auth: authLocales.ko,
      booking: bookingLocales.ko,
      marketing: marketingLocales.ko,
      "agent-desk": agentDeskLocales.ko,
      course: courseLocales.ko,
      // [/ATLAS:LOCALES_KO]
    },
    en: {
      // [ATLAS:LOCALES_EN]
      auth: authLocales.en,
      booking: bookingLocales.en,
      marketing: marketingLocales.en,
      "agent-desk": agentDeskLocales.en,
      course: courseLocales.en,
      // [/ATLAS:LOCALES_EN]
    },
  },
  debug: import.meta.env.DEV,
});
