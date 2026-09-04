import { useLingui } from "@lingui/react/macro";
import {
	isSupportedLocale,
	LOCALE_LABELS,
	SUPPORTED_LOCALES,
} from "@superset/i18n";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { HiOutlineLanguage } from "react-icons/hi2";
import { track } from "renderer/lib/analytics";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";

const AUTO = "auto";

/**
 * Optional language step. Rendered only when more than one locale ships, so
 * the row disappears rather than offering a choice of one. The app has already
 * inferred a locale from the system by the time onboarding runs — this is the
 * chance to correct it, not the first time it is asked.
 */
export function OnboardingLanguageRow() {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const { data: language } = electronTrpc.settings.getLanguage.useQuery();
	const updateLocale = cloudTrpc.user.updateLocale.useMutation();
	const setLanguage = electronTrpc.settings.setLanguage.useMutation({
		onSuccess: async (_data, variables) => {
			await utils.settings.getLanguage.invalidate();
			updateLocale.mutate(
				{ locale: variables.language },
				{ onError: () => {} },
			);
		},
	});

	return (
		<div className="flex items-center gap-4 py-7 first:pt-0 last:pb-0">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
				<HiOutlineLanguage className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-foreground">
					{t({ message: "Language" })}
				</p>
				<p className="text-xs text-muted-foreground">
					{t({
						message:
							"Auto follows your system language. You can change it later in Settings.",
					})}
				</p>
			</div>
			<Select
				value={language ?? AUTO}
				onValueChange={(value) => {
					track("language_changed", {
						from: language ?? AUTO,
						to: value,
						surface: "onboarding",
					});
					setLanguage.mutate({
						language:
							value === AUTO || !isSupportedLocale(value) ? null : value,
					});
				}}
			>
				<SelectTrigger
					size="sm"
					className="w-auto min-w-44 px-2"
					aria-label={t({
						message: "App display language",
					})}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={AUTO}>
						{t({ message: "Auto (system)" })}
					</SelectItem>
					{SUPPORTED_LOCALES.map((locale) => (
						<SelectItem key={locale} value={locale}>
							{LOCALE_LABELS[locale]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
