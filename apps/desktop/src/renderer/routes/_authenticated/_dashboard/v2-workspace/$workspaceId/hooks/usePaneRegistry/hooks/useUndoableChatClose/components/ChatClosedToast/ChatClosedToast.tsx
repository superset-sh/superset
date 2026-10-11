import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { MessageSquareIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useHotkey } from "renderer/hotkeys";

export function ChatClosedToast({
	titles,
	durationMs,
	onRevert,
}: {
	titles: string[];
	durationMs: number;
	onRevert: () => void;
}) {
	const { t } = useLingui();
	const countdownRef = useRef<HTMLDivElement>(null);
	const animationRef = useRef<Animation | null>(null);
	const { keys } = useHotkey("REOPEN_CLOSED_CHATS", onRevert, {
		enableOnFormTags: false,
		enableOnContentEditable: false,
	});

	useEffect(() => {
		const animation = countdownRef.current?.animate(
			[{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
			{ duration: durationMs, easing: "linear", fill: "forwards" },
		);
		animationRef.current = animation ?? null;
		return () => animation?.cancel();
	}, [durationMs]);

	return (
		<div
			className="relative flex w-[356px] items-center gap-3 overflow-hidden rounded-lg border border-border bg-popover py-2.5 pr-2.5 pl-3 shadow-lg"
			onPointerEnter={() => animationRef.current?.pause()}
			onPointerLeave={() => {
				if (animationRef.current?.playState === "paused") {
					animationRef.current.play();
				}
			}}
		>
			<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<MessageSquareIcon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-popover-foreground">
					{titles.length === 1
						? t({ message: "Chat closed" })
						: t({
								message: plural(titles.length, {
									one: "# chat closed",
									other: "# chats closed",
								}),
							})}
				</p>
				<p className="truncate text-xs text-muted-foreground">
					{titles.join(", ")}
				</p>
			</div>
			<Button
				className="h-7 shrink-0 gap-2 px-2"
				onClick={onRevert}
				size="sm"
				variant="secondary"
			>
				<Trans>Revert</Trans>
				{keys[0] !== "Unassigned" && (
					<KbdGroup>
						{keys.map((key) => (
							<Kbd className="bg-background/60" key={key}>
								{key}
							</Kbd>
						))}
					</KbdGroup>
				)}
			</Button>
			<div
				className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-muted-foreground/40"
				ref={countdownRef}
			/>
		</div>
	);
}
