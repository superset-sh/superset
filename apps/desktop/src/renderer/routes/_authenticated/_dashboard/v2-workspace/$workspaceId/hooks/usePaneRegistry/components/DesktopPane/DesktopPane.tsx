import { Trans } from "@lingui/react/macro";
import RFB from "@novnc/novnc";
import { Button } from "@superset/ui/button";
import { useEffect, useRef, useState } from "react";
import { HiOutlineCursorArrowRays } from "react-icons/hi2";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { useTerminalTheme } from "renderer/stores/theme";

type Status = "connecting" | "connected" | "unavailable" | "error";

interface DesktopPaneProps {
	hostUrl: string | null;
}

function buildSocketUrl(hostUrl: string): string {
	const url = new URL("/desktop/vnc", hostUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	const token = getHostServiceWsToken(hostUrl);
	if (token) url.searchParams.set("token", token);
	return url.toString();
}

/**
 * The sandbox's display, view-only until the person takes control. An agent
 * may be driving the desktop; a stray click or keystroke from a pane that
 * merely has focus would land in its browser, so input is opt-in and
 * released explicitly.
 */
export function DesktopPane({ hostUrl }: DesktopPaneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const rfbRef = useRef<RFB | null>(null);
	const [status, setStatus] = useState<Status>("connecting");
	const [detail, setDetail] = useState<string | null>(null);
	const [controlling, setControlling] = useState(false);
	// The display is letterboxed inside the pane; the terminal's background is
	// the surface every other pane in the workspace already sits on.
	const background = useTerminalTheme()?.background ?? "#151110";

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !hostUrl) return;

		setStatus("connecting");
		setDetail(null);
		setControlling(false);

		let rfb: RFB | null = null;
		try {
			rfb = new RFB(container, buildSocketUrl(hostUrl));
		} catch (error) {
			setStatus("error");
			setDetail(error instanceof Error ? error.message : String(error));
			return;
		}
		// The display stays 1920x1200 and is scaled to fit: Chrome and the
		// Electron desktop render at a real desktop size, and a resize would only
		// happen once someone took control anyway.
		rfb.scaleViewport = true;
		rfb.resizeSession = false;
		rfb.viewOnly = true;
		// Settable at runtime (noVNC paints it around the display) but absent
		// from the package's type declarations.
		(rfb as unknown as { background: string }).background = background;
		rfbRef.current = rfb;

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
			rfbRef.current = null;
			try {
				rfb?.disconnect();
			} catch {}
		};
	}, [hostUrl, background]);

	const setControl = (next: boolean) => {
		const rfb = rfbRef.current;
		if (!rfb) return;
		rfb.viewOnly = !next;
		if (next) rfb.focus();
		setControlling(next);
	};

	return (
		<div className="relative size-full" style={{ backgroundColor: background }}>
			<div ref={containerRef} className="size-full" />
			{status === "connected" && !controlling && (
				<div className="absolute inset-0 flex items-center justify-center">
					<Button
						size="sm"
						className="pointer-events-auto"
						onClick={() => setControl(true)}
					>
						<HiOutlineCursorArrowRays className="size-4" />
						<Trans>Take control</Trans>
					</Button>
				</div>
			)}
			{status === "connected" && controlling && (
				<Button
					size="sm"
					className="absolute top-2 right-2"
					onClick={() => setControl(false)}
				>
					<Trans>Release control</Trans>
				</Button>
			)}
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
