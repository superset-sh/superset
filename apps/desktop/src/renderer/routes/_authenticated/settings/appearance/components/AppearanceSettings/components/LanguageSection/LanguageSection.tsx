import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useTranslation } from "react-i18next";
import {
	defaultLocale,
	isLocale,
	LOCALE_STORAGE_KEY,
	type Locale,
	locales,
} from "renderer/i18n";

const LABEL_KEY: Record<Locale, "english" | "chinese"> = {
	en: "english",
	zh: "chinese",
};

export function LanguageSection() {
	const { t, i18n } = useTranslation();
	const current: Locale = isLocale(i18n.language)
		? i18n.language
		: defaultLocale;

	const handleChange = async (next: string): Promise<void> => {
		if (!isLocale(next) || next === current) return;
		window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
		await i18n.changeLanguage(next);
	};

	return (
		<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">
						{t("settings.appearance.language.label")}
					</div>
					<div className="text-xs text-muted-foreground">
						{t("settings.appearance.language.hint")}
					</div>
				</div>
				<Select
					value={current}
					onValueChange={(value) => {
						void handleChange(value);
					}}
				>
					<SelectTrigger size="sm" className="w-auto min-w-32 px-2">
						<SelectValue>
							<span className="truncate text-xs">
								{t(`locale.${LABEL_KEY[current]}`)}
							</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{locales.map((value) => (
							<SelectItem key={value} value={value}>
								{t(`locale.${LABEL_KEY[value]}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
