import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { RotateCcw } from "lucide-react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_UI_FONT_FAMILY } from "renderer/lib/ui-font";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { FontFamilyCombobox } from "../FontFamilyCombobox";
import { useSystemFonts } from "../useSystemFonts";

export function InterfaceFontSection() {
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const { data, isLoading } = electronTrpc.settings.getFontSettings.useQuery();
	const { fonts, isLoading: fontsLoading } = useSystemFonts();

	const setFontSettings = electronTrpc.settings.setFontSettings.useMutation({
		// Apply the new family before the write lands so the whole app restyles
		// on selection; roll back and report if persisting fails.
		onMutate: async (input) => {
			await utils.settings.getFontSettings.cancel();
			const previous = utils.settings.getFontSettings.getData();
			if (previous) {
				utils.settings.getFontSettings.setData(undefined, {
					...previous,
					...input,
				});
			}
			return { previous };
		},
		onError: (error, _input, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getFontSettings.setData(undefined, context.previous);
			}
			toast.error(error.message);
		},
		onSettled: () => {
			void utils.settings.getFontSettings.invalidate();
		},
	});

	const uiFontFamily = data?.uiFontFamily ?? null;

	return (
		<section aria-labelledby="interface-font-title">
			<h3 id="interface-font-title" className="text-sm font-medium mb-1">
				<HighlightText text="Interface font" query={searchQuery} />
			</h3>
			<p className="text-xs text-muted-foreground mb-3">
				Typeface used for the app itself — sidebars, tabs, menus and settings.
				Terminal and editor panels keep their own typography.
			</p>

			<div className="flex items-end gap-2">
				<div className="space-y-1.5 max-w-sm flex-1">
					<Label className="text-xs">Font family</Label>
					<FontFamilyCombobox
						value={uiFontFamily}
						defaultValue={DEFAULT_UI_FONT_FAMILY}
						onValueChange={(value) =>
							setFontSettings.mutate({ uiFontFamily: value })
						}
						disabled={isLoading}
						variant="ui"
						fonts={fonts}
						fontsLoading={fontsLoading}
					/>
				</div>
				{uiFontFamily !== null && (
					<Button
						variant="ghost"
						size="sm"
						className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground"
						onClick={() => setFontSettings.mutate({ uiFontFamily: null })}
					>
						<RotateCcw className="size-3.5" />
						Reset
					</Button>
				)}
			</div>
		</section>
	);
}
