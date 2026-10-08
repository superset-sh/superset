"use client";

import { Trans } from "@lingui/react/macro";
import { ArrowUpRight } from "lucide-react";
import { type MouseEvent, useEffect, useRef } from "react";

export function LeaderboardJoin() {
	const cancelOpen = useRef<(() => void) | null>(null);
	useEffect(() => () => cancelOpen.current?.(), []);
	const openApp = (event: MouseEvent<HTMLAnchorElement>) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		if (
			/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
			(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
		)
			return;
		event.preventDefault();
		cancelOpen.current?.();
		const cleanup = () => {
			window.clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("blur", cleanup);
		};
		const onVisibility = () => {
			if (document.visibilityState === "hidden") cleanup();
		};
		const timer = window.setTimeout(() => {
			cleanup();
			window.location.assign("/download");
		}, 1800);
		cancelOpen.current = cleanup;
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("blur", cleanup, { once: true });
		window.location.assign("superset://settings/account");
	};

	return (
		<a
			href="/download"
			onClick={openApp}
			className="group inline-flex min-h-11 shrink-0 self-start items-center justify-center gap-3 rounded-[2px] border border-brand bg-background px-3.5 py-2 text-sm font-normal leading-5 text-brand transition-colors hover:border-brand-light hover:bg-brand/5 active:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
		>
			<Trans>Join the leaderboard</Trans>
			<ArrowUpRight
				aria-hidden="true"
				className="size-4 opacity-70 transition-opacity group-hover:opacity-100"
				strokeWidth={1.5}
			/>
		</a>
	);
}
