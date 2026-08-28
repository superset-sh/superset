import { SUPPORTED_LOCALES, type SupportedLocale } from "@superset/i18n";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

const AUTO = "auto";

// Native-language labels: a user stuck in the wrong language must be able to
// recognize their own in this list, so entries are never translated.
const LOCALE_LABELS: Record<SupportedLocale, string> = {
	en: "English",
};

export function LanguageSection() {
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const { data: language } = electronTrpc.settings.getLanguage.useQuery();
	// Write-through so async surfaces (email, web SSR) follow the choice; a
	// signed-out desktop just keeps the local setting.
	const updateLocale = cloudTrpc.user.updateLocale.useMutation();
	const setLanguage = electronTrpc.settings.setLanguage.useMutation({
		onSuccess: async (_data, variables) => {
			await utils.settings.getLanguage.invalidate();
			updateLocale.mutate(
				{ locale: variables.language },
				{
					onError: (error) => {
						// Signed-out desktops keep the local setting; only real
						// sync failures need surfacing.
						if (error.data?.code === "UNAUTHORIZED") return;
						toast.error(
							"Language saved on this device, but syncing it to your account failed.",
						);
					},
				},
			);
		},
		onError: () => toast.error("Failed to update language"),
	});

	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">
					<HighlightText text="Language" query={searchQuery} />
				</div>
				<div className="text-xs text-muted-foreground">
					<HighlightText
						text="App display language. Auto follows your system language."
						query={searchQuery}
					/>
				</div>
			</div>
			<Select
				value={language ?? AUTO}
				onValueChange={(value) =>
					setLanguage.mutate({ language: value === AUTO ? null : value })
				}
			>
				<SelectTrigger size="sm" className="w-auto min-w-44 px-2">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={AUTO}>Auto (system)</SelectItem>
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
