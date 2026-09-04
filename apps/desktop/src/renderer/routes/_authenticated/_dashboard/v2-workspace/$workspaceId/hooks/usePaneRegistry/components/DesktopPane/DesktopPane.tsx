import { Trans } from "@lingui/react/macro";
import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import {
	getHostServiceWsToken,
	getHostServiceWsUrlParams,
} from "renderer/lib/host-service-auth";

type Status = "connecting" | "connected" | "unavailable" | "error";

interface DesktopPaneProps {
	hostUrl: string | null;
}

function buildSocketUrl(hostUrl: string): string {
	const url = new URL("/desktop/vnc", hostUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	const token = getHostServiceWsToken(hostUrl);
	if (token) url.searchParams.set("token", token);
	for (const [k, v] of Object.entries(
		getHostServiceWsUrlParams(hostUrl) ?? {},
	)) {
		url.searchParams.set(k, v);
	}
	return url.toString();
}

export function DesktopPane({ hostUrl }: DesktopPaneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<Status>("connecting");
	const [detail, setDetail] = useState<string | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !hostUrl) return;

		setStatus("connecting");
		setDetail(null);

		let rfb: RFB | null = null;
		try {
			rfb = new RFB(container, buildSocketUrl(hostUrl));
		} catch (error) {
			setStatus("error");
			setDetail(error instanceof Error ? error.message : String(error));
			return;
		}
		rfb.scaleViewport = true;
		rfb.resizeSession = true;

		const onConnect = () => setStatus("connected");
		const onDisconnect = (event: CustomEvent<{ clean: boolean }>) => {
			// 1011 with this reason is the route saying nothing is listening on the
			// display, which is the ordinary case on a sandbox without one.
			setStatus(event.detail.clean ? "unavailable" : "error");
		};
		rfb.addEventListener("connect", onConnect);
		rfb.addEventListener("disconnect", onDisconnect);

		return () => {
			rfb?.removeEventListener("connect", onConnect);
			rfb?.removeEventListener("disconnect", onDisconnect);
			try {
				rfb?.disconnect();
			} catch {}
		};
	}, [hostUrl]);

	return (
		<div className="relative size-full bg-black">
			<div ref={containerRef} className="size-full" />
			{status !== "connected" && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/95">
					<div className="max-w-sm px-6 text-center text-sm text-muted-foreground">
						{status === "connecting" && (
							<Trans>Connecting to the desktop…</Trans>
						)}
						{status === "unavailable" && (
							<Trans>No desktop session is running in this sandbox.</Trans>
						)}
						{status === "error" && <Trans>Could not reach the desktop.</Trans>}
						{detail && <div className="mt-2 text-xs opacity-70">{detail}</div>}
					</div>
				</div>
			)}
		</div>
	);
}
