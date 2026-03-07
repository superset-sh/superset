import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { getPaneRef, subscribePaneRef } from "renderer/stores/tabs/pane-refs";
import { terminalDebugLog } from "./debug";
import { Terminal } from "./Terminal";
import type { TerminalProps } from "./types";

function usePaneHost(paneId: string): HTMLElement | null {
	return useSyncExternalStore(
		(listener) => subscribePaneRef(paneId, listener),
		() => getPaneRef(paneId),
		() => null,
	);
}

export function PersistentTerminal(props: TerminalProps) {
	const { paneId } = props;
	const host = usePaneHost(paneId);
	const hiddenHostRef = useRef<HTMLDivElement>(null);
	const [hasBeenVisible, setHasBeenVisible] = useState(false);
	const [lastKnownSize, setLastKnownSize] = useState({ width: 1, height: 1 });

	useEffect(() => {
		if (host) {
			setHasBeenVisible(true);
		}
		terminalDebugLog("dom", paneId, "persistent-host:change", {
			hasHost: !!host,
			tagName: host?.tagName ?? null,
		});
	}, [host, paneId]);

	useLayoutEffect(() => {
		if (!host) return;

		const updateSize = () => {
			const rect = host.getBoundingClientRect();
			const width = Math.max(1, Math.round(rect.width));
			const height = Math.max(1, Math.round(rect.height));
			setLastKnownSize((current) => {
				if (current.width === width && current.height === height) {
					return current;
				}
				return { width, height };
			});
		};

		updateSize();

		const resizeObserver = new ResizeObserver(updateSize);
		resizeObserver.observe(host);

		return () => {
			resizeObserver.disconnect();
		};
	}, [host]);

	if (!hasBeenVisible) {
		return host
			? createPortal(<Terminal {...props} isVisible />, host, paneId)
			: null;
	}

	const hiddenHost = (
		<div
			ref={hiddenHostRef}
			aria-hidden
			className="pointer-events-none fixed top-0 overflow-hidden"
			style={{
				left: "-200vw",
				width: lastKnownSize.width,
				height: lastKnownSize.height,
				visibility: "hidden",
			}}
		/>
	);

	const target = host ?? hiddenHostRef.current;
	terminalDebugLog("dom", paneId, "persistent-target", {
		target: host ? "host" : "hidden-host",
		isVisible: !!host,
	});

	return (
		<>
			{hiddenHost}
			{target
				? createPortal(
						<Terminal {...props} isVisible={!!host} />,
						target,
						paneId,
					)
				: null}
		</>
	);
}
