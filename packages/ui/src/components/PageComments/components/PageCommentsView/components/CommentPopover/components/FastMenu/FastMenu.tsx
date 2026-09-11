"use client";

import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { PRESET_KEYS, QUICK_PRESETS } from "../../constants";

interface FastMenuProps {
	onPick: (body: MessageDescriptor) => void;
	onClose: () => void;
}

export function FastMenu({ onPick, onClose }: FastMenuProps) {
	const { i18n } = useLingui();

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target?.isContentEditable || target?.closest("input, textarea")) {
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}
			const index = PRESET_KEYS.indexOf(event.key);
			const preset = index === -1 ? undefined : QUICK_PRESETS[index];
			if (!preset) return;
			event.preventDefault();
			onPick(preset.body);
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [onClose, onPick]);

	return (
		<div
			data-comment-ui=""
			className="absolute top-full left-0 z-10 mt-1.5 w-64 overflow-hidden rounded-lg border bg-popover py-1 text-popover-foreground shadow-lg"
		>
			{QUICK_PRESETS.map((preset, index) => (
				<button
					key={preset.id}
					type="button"
					onClick={() => onPick(preset.body)}
					className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
				>
					<preset.icon className="size-4 shrink-0 text-muted-foreground" />
					<span className="flex-1 truncate">{i18n._(preset.body)}</span>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{PRESET_KEYS[index]}
					</span>
				</button>
			))}
		</div>
	);
}
