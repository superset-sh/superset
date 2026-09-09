import { Trans, useLingui } from "@lingui/react/macro";
import type { TerminalLinkBehavior } from "@superset/local-db";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function LinkBehaviorSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();

	const { data: terminalLinkBehavior, isLoading } =
		electronTrpc.settings.getTerminalLinkBehavior.useQuery();

	const setTerminalLinkBehavior =
		electronTrpc.settings.setTerminalLinkBehavior.useMutation({
			onMutate: async ({ behavior }) => {
				await utils.settings.getTerminalLinkBehavior.cancel();
				const previous = utils.settings.getTerminalLinkBehavior.getData();
				utils.settings.getTerminalLinkBehavior.setData(undefined, behavior);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getTerminalLinkBehavior.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTerminalLinkBehavior.invalidate();
			},
		});

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="terminal-link-behavior" className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Terminal file links",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Choose how to open file paths when Cmd+clicking in the terminal
					</Trans>
				</p>
			</div>
			<Select
				value={terminalLinkBehavior ?? "file-viewer"}
				onValueChange={(value) =>
					setTerminalLinkBehavior.mutate({
						behavior: value as TerminalLinkBehavior,
					})
				}
				disabled={isLoading || setTerminalLinkBehavior.isPending}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="external-editor">
						<Trans>External editor</Trans>
					</SelectItem>
					<SelectItem value="file-viewer">
						<Trans>File viewer</Trans>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
