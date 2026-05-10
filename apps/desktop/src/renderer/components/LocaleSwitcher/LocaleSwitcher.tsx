import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Languages } from "lucide-react";
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

export function LocaleSwitcher() {
	const { t, i18n } = useTranslation();
	const current: Locale = isLocale(i18n.language)
		? i18n.language
		: defaultLocale;

	const handleSelect = async (next: string): Promise<void> => {
		if (!isLocale(next) || next === current) return;
		window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
		await i18n.changeLanguage(next);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="gap-2"
					aria-label={t("locale.switchLanguage")}
				>
					<Languages className="size-4" />
					<span className="text-sm">{t(`locale.${LABEL_KEY[current]}`)}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					value={current}
					onValueChange={(value) => {
						void handleSelect(value);
					}}
				>
					{locales.map((value) => (
						<DropdownMenuRadioItem
							key={value}
							value={value}
							className="cursor-pointer"
						>
							{t(`locale.${LABEL_KEY[value]}`)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
