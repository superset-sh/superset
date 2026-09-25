import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	DEFAULT_TERMINAL_PARKED_RUNTIME_CAP,
	MAX_TERMINAL_PARKED_RUNTIME_CAP,
	MIN_TERMINAL_PARKED_RUNTIME_CAP,
} from "shared/constants";

export function BackgroundTerminalsSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();

	const { data: cap, isLoading } =
		electronTrpc.settings.getTerminalParkedRuntimeCap.useQuery();

	const setCap = electronTrpc.settings.setTerminalParkedRuntimeCap.useMutation({
		onMutate: async ({ cap: nextCap }) => {
			await utils.settings.getTerminalParkedRuntimeCap.cancel();
			const previous = utils.settings.getTerminalParkedRuntimeCap.getData();
			utils.settings.getTerminalParkedRuntimeCap.setData(undefined, nextCap);
			terminalRuntimeRegistry.setParkedRuntimeCap(nextCap);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getTerminalParkedRuntimeCap.setData(
					undefined,
					context.previous,
				);
				terminalRuntimeRegistry.setParkedRuntimeCap(context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getTerminalParkedRuntimeCap.invalidate();
		},
	});

	const [draft, setDraft] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync draft state when the persisted cap changes
	useEffect(() => {
		setDraft(null);
	}, [cap]);

	const commitDraft = (raw: string) => {
		const value = Number.parseInt(raw, 10);
		if (
			!Number.isNaN(value) &&
			value >= MIN_TERMINAL_PARKED_RUNTIME_CAP &&
			value <= MAX_TERMINAL_PARKED_RUNTIME_CAP &&
			value !== cap
		) {
			setCap.mutate({ cap: value });
		}
		setDraft(null);
	};

	return (
		<div className="flex items-center justify-between gap-10">
			<div className="space-y-1">
				<Label
					htmlFor="terminal-background-limit"
					className="text-sm font-medium"
				>
					<HighlightText
						text={t({
							message: "Background terminal memory",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground max-w-md leading-relaxed">
					<Trans>
						How many hidden terminals stay fully loaded (
						{MIN_TERMINAL_PARKED_RUNTIME_CAP}–{MAX_TERMINAL_PARKED_RUNTIME_CAP}
						); older ones keep running but reload their last 1,000 lines when
						reopened
					</Trans>
				</p>
			</div>
			<Input
				id="terminal-background-limit"
				type="number"
				min={MIN_TERMINAL_PARKED_RUNTIME_CAP}
				max={MAX_TERMINAL_PARKED_RUNTIME_CAP}
				value={draft ?? String(cap ?? DEFAULT_TERMINAL_PARKED_RUNTIME_CAP)}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={(e) => commitDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
				disabled={isLoading || setCap.isPending}
				className="w-20 shrink-0"
			/>
		</div>
	);
}
