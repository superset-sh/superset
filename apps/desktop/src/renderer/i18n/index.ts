import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultLocale, detectInitialLocale, locales } from "./config";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

void i18n.use(initReactI18next).init({
	resources: {
		en: { translation: en },
		zh: { translation: zh },
	},
	lng: detectInitialLocale(),
	fallbackLng: defaultLocale,
	supportedLngs: [...locales],
	interpolation: { escapeValue: false },
	returnNull: false,
});

export { i18n };
export * from "./config";
