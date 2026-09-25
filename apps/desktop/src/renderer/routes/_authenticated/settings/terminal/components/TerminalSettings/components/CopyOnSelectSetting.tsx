import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function CopyOnSelectSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();

	const { data: copyOnSelect, isLoading } =
		electronTrpc.settings.getTerminalCopyOnSelect.useQuery();

	const setCopyOnSelect =
		electronTrpc.settings.setTerminalCopyOnSelect.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getTerminalCopyOnSelect.cancel();
				const previous = utils.settings.getTerminalCopyOnSelect.getData();
				utils.settings.getTerminalCopyOnSelect.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getTerminalCopyOnSelect.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTerminalCopyOnSelect.invalidate();
			},
		});

	return (
		<div className="flex items-center justify-between gap-10">
			<div className="space-y-1">
				<Label
					htmlFor="terminal-copy-on-select"
					className="text-sm font-medium"
				>
					<HighlightText
						text={t({
							message: "Copy on select",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground max-w-md leading-relaxed">
					<Trans>
						Selecting text in a terminal copies it to the clipboard right away,
						with trailing whitespace trimmed
					</Trans>
				</p>
			</div>
			<Switch
				id="terminal-copy-on-select"
				checked={copyOnSelect ?? false}
				onCheckedChange={(checked) =>
					setCopyOnSelect.mutate({ enabled: checked })
				}
				disabled={isLoading || setCopyOnSelect.isPending}
				className="shrink-0"
			/>
		</div>
	);
}
