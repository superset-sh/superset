import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DEFAULT_TERMINAL_SCROLLBACK,
	MAX_TERMINAL_SCROLLBACK,
	MIN_TERMINAL_SCROLLBACK,
	normalizeTerminalScrollbackLines,
} from "shared/constants";

function parseScrollbackDraft(draft: string): number | null {
	if (draft.trim() === "") return null;

	const value = Number(draft);
	if (!Number.isFinite(value)) return null;

	return normalizeTerminalScrollbackLines(value);
}

export function ScrollbackSetting() {
	const utils = electronTrpc.useUtils();

	const { data: scrollbackLines = DEFAULT_TERMINAL_SCROLLBACK, isLoading } =
		electronTrpc.settings.getTerminalScrollbackLines.useQuery();
	const [draft, setDraft] = useState<string | null>(null);
	const skipNextBlurCommitRef = useRef(false);

	const setTerminalScrollback =
		electronTrpc.settings.setTerminalScrollbackLines.useMutation({
			onMutate: async ({ scrollbackLines: nextScrollbackLines }) => {
				await utils.settings.getTerminalScrollbackLines.cancel();
				const previous = utils.settings.getTerminalScrollbackLines.getData();
				utils.settings.getTerminalScrollbackLines.setData(
					undefined,
					nextScrollbackLines,
				);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getTerminalScrollbackLines.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTerminalScrollbackLines.invalidate();
			},
		});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset draft after the persisted setting changes
	useEffect(() => {
		setDraft(null);
	}, [scrollbackLines]);

	const commitDraft = useCallback(() => {
		const nextScrollbackLines = parseScrollbackDraft(
			draft ?? String(scrollbackLines),
		);
		setDraft(null);

		if (
			nextScrollbackLines === null ||
			nextScrollbackLines === scrollbackLines
		) {
			return;
		}

		setTerminalScrollback.mutate({ scrollbackLines: nextScrollbackLines });
	}, [draft, scrollbackLines, setTerminalScrollback]);

	const disabled = isLoading || setTerminalScrollback.isPending;

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="space-y-0.5">
				<Label htmlFor="terminal-scrollback" className="text-sm font-medium">
					Terminal scrollback
				</Label>
				<p className="text-xs text-muted-foreground">
					Lines kept for scrolling in each terminal
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Input
					id="terminal-scrollback"
					type="number"
					min={MIN_TERMINAL_SCROLLBACK}
					max={MAX_TERMINAL_SCROLLBACK}
					step={1000}
					value={draft ?? String(scrollbackLines)}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={() => {
						if (skipNextBlurCommitRef.current) {
							skipNextBlurCommitRef.current = false;
							return;
						}
						commitDraft();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.currentTarget.blur();
						} else if (event.key === "Escape") {
							skipNextBlurCommitRef.current = true;
							setDraft(null);
							event.currentTarget.blur();
						}
					}}
					disabled={disabled}
					className="w-32 text-right tabular-nums"
				/>
				{scrollbackLines !== DEFAULT_TERMINAL_SCROLLBACK && (
					<Button
						variant="ghost"
						size="sm"
						className="shrink-0 text-xs text-muted-foreground"
						disabled={disabled}
						onClick={() => {
							setDraft(null);
							setTerminalScrollback.mutate({
								scrollbackLines: DEFAULT_TERMINAL_SCROLLBACK,
							});
						}}
					>
						Reset
					</Button>
				)}
			</div>
		</div>
	);
}
