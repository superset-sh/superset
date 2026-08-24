import { buildHostRoutingKey } from "@superset/shared/host-routing";
import * as Clipboard from "expo-clipboard";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import { AppState, Linking } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { withUniwind } from "uniwind";
import { getHostAuthToken, getRelayUrl } from "@/lib/host/client";
import { ensureSandboxAccess, isSandboxHost } from "@/lib/sandbox-access";

const StyledWebView = withUniwind(WebView);

export type TerminalConnectionState =
	| "connecting"
	| "reconnecting"
	| "open"
	| "error"
	| "denied"
	| "ended";

export interface TerminalControlMessage {
	type: string;
	title?: string | null;
	message?: string;
	exitCode?: number;
	signal?: number;
}

export interface TerminalSelectState {
	active: boolean;
	hasSelection: boolean;
}

export interface TerminalWebViewHandle {
	/** Write raw bytes into the PTY (quick keys, native composers). */
	sendInput: (data: string) => void;
	/** Focus xterm's hidden textarea so the soft keyboard comes up. */
	focus: () => void;
	/** Reset the reconnect budget and redial (also the resume path). */
	retry: () => void;
	/** Copy the select-mode selection to the clipboard and leave select mode. */
	copySelection: () => void;
	/** Return the viewport to the live edge of the scrollback. */
	scrollToBottom: () => void;
}

export interface TerminalHost {
	organizationId: string;
	/** A machine id, or a cloud workspace's id when its sandbox is the host. */
	machineId: string;
}

interface TerminalWebViewProps {
	workspaceId: string;
	terminalId: string;
	host: TerminalHost;
	onStateChange: (state: TerminalConnectionState) => void;
	onControl: (message: TerminalControlMessage) => void;
	/** Select mode entered/left, or the selection emptied — drives the
	 *  native Copy Selection row, which lives outside the WebView. */
	onSelectChange?: (select: TerminalSelectState) => void;
	/** Select-mode text landed on the clipboard (either copy path). */
	onCopied?: () => void;
	/** The viewport reached or left the bottom of the scrollback — drives the
	 *  scroll-to-bottom button, which lives outside the WebView. */
	onScrollChange?: (atBottom: boolean) => void;
}

type PageMessage =
	| { type: "ready" }
	| { type: "dial"; id: number; replay: "0" | "1" }
	| { type: "state"; state: TerminalConnectionState }
	| { type: "control"; message: TerminalControlMessage }
	| { type: "openUrl"; url: string }
	| { type: "copy"; text: string }
	| { type: "select"; active: boolean; hasSelection: boolean }
	| { type: "scroll"; atBottom: boolean };

/**
 * Hosts the xterm.js page (terminalHtml.generated.ts) and speaks its bridge
 * protocol. The WebSocket lives inside the page so PTY output never crosses
 * the RN bridge; this side only signs dial URLs (fresh JWT per attempt, same
 * contract as web's TerminalConnection), relays UI intents, and lends the
 * page what a WebView can't do itself: open a tapped link, write the
 * clipboard from select mode.
 */
export const TerminalWebView = forwardRef<
	TerminalWebViewHandle,
	TerminalWebViewProps
>(function TerminalWebView(
	{
		workspaceId,
		terminalId,
		host,
		onStateChange,
		onControl,
		onSelectChange,
		onCopied,
		onScrollChange,
	},
	ref,
) {
	const webViewRef = useRef<WebView>(null);
	// Callbacks go through refs so onMessage identity stays stable — remounting
	// the WebView on a parent re-render would drop the live socket.
	const onStateChangeRef = useRef(onStateChange);
	onStateChangeRef.current = onStateChange;
	const onControlRef = useRef(onControl);
	onControlRef.current = onControl;
	const onSelectChangeRef = useRef(onSelectChange);
	onSelectChangeRef.current = onSelectChange;
	const onCopiedRef = useRef(onCopied);
	onCopiedRef.current = onCopied;
	const onScrollChangeRef = useRef(onScrollChange);
	onScrollChangeRef.current = onScrollChange;

	// Parsing the ~400KB generated module is deferred to first mount instead of
	// app startup (expo-router requires route modules eagerly).
	const html = useMemo(
		() =>
			(
				require("./terminalHtml.generated") as {
					TERMINAL_HTML: string;
				}
			).TERMINAL_HTML,
		[],
	);

	const postToPage = useCallback((message: object) => {
		webViewRef.current?.postMessage(JSON.stringify(message));
	}, []);

	// Signed per attempt, never cached: the relay wants a fresh JWT and a
	// sandbox's edge token expires, so a redial after a long background must
	// re-mint rather than reuse the URL that worked last time.
	const buildDialUrl = useCallback(
		async (replay: "0" | "1"): Promise<string> => {
			const token = await getHostAuthToken();
			const query = [
				`workspaceId=${encodeURIComponent(workspaceId)}`,
				"themeType=dark",
				...(replay === "0" ? ["replay=0"] : []),
				`token=${encodeURIComponent(token)}`,
			];
			const path = `/terminal/${encodeURIComponent(terminalId)}`;
			if (isSandboxHost(host.machineId)) {
				// A browser can't put a header on a WebSocket upgrade, so the
				// provider's edge reads its token from the query string here.
				const access = await ensureSandboxAccess(host.machineId);
				query.push(`bl_preview_token=${encodeURIComponent(access.token)}`);
				return `${access.url.replace(/^http/, "ws")}${path}?${query.join("&")}`;
			}
			const base = getRelayUrl().replace(/^http/, "ws");
			const routingKey = buildHostRoutingKey(
				host.organizationId,
				host.machineId,
			);
			return `${base}/hosts/${routingKey}${path}?${query.join("&")}`;
		},
		[host.machineId, host.organizationId, terminalId, workspaceId],
	);

	const handleMessage = useCallback(
		(event: WebViewMessageEvent) => {
			let message: PageMessage;
			try {
				message = JSON.parse(event.nativeEvent.data) as PageMessage;
			} catch {
				return;
			}
			if (message.type === "dial") {
				const { id, replay } = message;
				buildDialUrl(replay)
					.then((url) => postToPage({ type: "dialUrl", id, url }))
					.catch((error: unknown) =>
						postToPage({
							type: "dialUrl",
							id,
							error: error instanceof Error ? error.message : "dial failed",
						}),
					);
			} else if (message.type === "state") {
				onStateChangeRef.current(message.state);
			} else if (message.type === "control") {
				onControlRef.current(message.message);
			} else if (message.type === "openUrl") {
				void Linking.openURL(message.url).catch(() => {});
			} else if (message.type === "copy") {
				void Clipboard.setStringAsync(message.text).then(
					() => onCopiedRef.current?.(),
					// Failed write: stay quiet rather than toast a false "Copied".
					() => {},
				);
			} else if (message.type === "select") {
				onSelectChangeRef.current?.({
					active: message.active,
					hasSelection: message.hasSelection,
				});
			} else if (message.type === "scroll") {
				onScrollChangeRef.current?.(message.atBottom);
			}
		},
		[buildDialUrl, postToPage],
	);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") postToPage({ type: "resume" });
		});
		return () => subscription.remove();
	}, [postToPage]);

	// Tab switches swap sessions inside the live page instead of remounting
	// the WebView — a remount pays the 400KB xterm parse and two cold TLS
	// handshakes on every switch; a switch reuses the warm connection pool.
	// If the page isn't booted yet the message is lost harmlessly: its first
	// dial request signs whatever terminalId is current.
	const mountedTerminalId = useRef(terminalId);
	useEffect(() => {
		if (mountedTerminalId.current === terminalId) return;
		mountedTerminalId.current = terminalId;
		postToPage({ type: "switch" });
	}, [terminalId, postToPage]);

	useImperativeHandle(
		ref,
		() => ({
			sendInput: (data: string) => postToPage({ type: "input", data }),
			focus: () => postToPage({ type: "focus" }),
			retry: () => postToPage({ type: "resume" }),
			copySelection: () => postToPage({ type: "copySelection" }),
			scrollToBottom: () => postToPage({ type: "scrollToBottom" }),
		}),
		[postToPage],
	);

	return (
		<StyledWebView
			ref={webViewRef}
			// Scrollback is whatever the agent printed — files, diffs, secrets.
			// A WebView is opaque to autocapture's tree walk today, so this is
			// belt and braces, but it is the subtree that must never be read.
			ph-no-capture
			// Background must match the page's #0a0a0a so resizes don't flash.
			className="flex-1 bg-[#0a0a0a]"
			source={{ html }}
			onMessage={handleMessage}
			bounces={false}
			scrollEnabled={false}
			setSupportMultipleWindows={false}
			keyboardDisplayRequiresUserAction={false}
			hideKeyboardAccessoryView
			webviewDebuggingEnabled={__DEV__}
		/>
	);
});
