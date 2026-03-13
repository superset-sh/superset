import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";

export function ScrollbackSetting() {
	const utils = electronTrpc.useUtils();

	const { data: scrollback, isLoading } =
		electronTrpc.settings.getTerminalScrollback.useQuery();

	const [localValue, setLocalValue] = useState("");

	useEffect(() => {
		if (scrollback !== undefined) {
			setLocalValue(String(scrollback));
		}
	}, [scrollback]);

	const setTerminalScrollback =
		electronTrpc.settings.setTerminalScrollback.useMutation({
			onMutate: async ({ scrollback: newValue }) => {
				await utils.settings.getTerminalScrollback.cancel();
				const previous = utils.settings.getTerminalScrollback.getData();
				utils.settings.getTerminalScrollback.setData(undefined, newValue);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getTerminalScrollback.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTerminalScrollback.invalidate();
			},
		});

	const handleBlur = () => {
		const parsed = Number.parseInt(localValue, 10);
		if (Number.isNaN(parsed) || parsed < 1000) {
			setLocalValue(String(scrollback ?? DEFAULT_TERMINAL_SCROLLBACK));
			return;
		}
		const clamped = Math.min(parsed, 100000);
		setLocalValue(String(clamped));
		if (clamped !== scrollback) {
			setTerminalScrollback.mutate({ scrollback: clamped });
		}
	};

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="terminal-scrollback" className="text-sm font-medium">
					Scrollback lines
				</Label>
				<p className="text-xs text-muted-foreground">
					Maximum lines kept in terminal history (1,000–100,000)
				</p>
			</div>
			<Input
				id="terminal-scrollback"
				type="number"
				min={1000}
				max={100000}
				step={1000}
				className="w-[120px]"
				value={localValue}
				onChange={(e) => setLocalValue(e.target.value)}
				onBlur={handleBlur}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						handleBlur();
					}
				}}
				disabled={isLoading || setTerminalScrollback.isPending}
			/>
		</div>
	);
}
