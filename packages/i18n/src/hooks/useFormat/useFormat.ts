"use client";
import { useLingui } from "@lingui/react";
import { useMemo } from "react";
import * as format from "../../format";

/** Context-bound formatters update with translations and are safe during SSR. */
export function useFormat() {
	const { i18n } = useLingui();
	const locale = i18n.locale;
	return useMemo(
		() => ({
			formatNumber: (
				value: number,
				options?: Intl.NumberFormatOptions,
				selectedLocale = locale,
			) => format.formatNumber(value, options, selectedLocale),
			formatPercent: (
				value: number,
				options?: Intl.NumberFormatOptions,
				selectedLocale = locale,
			) => format.formatPercent(value, options, selectedLocale),
			formatCompactNumber: (
				value: number,
				options?: Intl.NumberFormatOptions,
				selectedLocale = locale,
			) => format.formatCompactNumber(value, options, selectedLocale),
			formatList: (
				value: string[],
				options?: Intl.ListFormatOptions,
				selectedLocale = locale,
			) => format.formatList(value, options, selectedLocale),
			formatDate: (
				value: Date | number,
				options?: Intl.DateTimeFormatOptions,
				selectedLocale = locale,
			) => format.formatDate(value, options, selectedLocale),
			formatDateTime: (
				value: Date | number,
				options?: Intl.DateTimeFormatOptions,
				selectedLocale = locale,
			) => format.formatDateTime(value, options, selectedLocale),
			formatCurrency: (
				value: number,
				currency?: string,
				options?: Intl.NumberFormatOptions,
				selectedLocale = locale,
			) => format.formatCurrency(value, currency, options, selectedLocale),
			formatPrice: (value: number, currency: string) =>
				format.formatPrice(value, currency, locale),
			formatRelativeTime: (
				value: Date | number,
				now?: Date | number,
				options?: Intl.RelativeTimeFormatOptions,
				selectedLocale = locale,
			) => format.formatRelativeTime(value, now, options, selectedLocale),
			formatCompactRelativeTime: (value: Date | number, now?: Date | number) =>
				format.formatCompactRelativeTime(value, now, locale),
		}),
		[locale],
	);
}
