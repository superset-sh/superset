import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import { AppState } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { withUniwind } from "uniwind";
import { getHostAuthToken, getRelayUrl } from "@/lib/host/client";

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

export interface TerminalWebViewHandle {
	/** Write raw bytes into the PTY (quick keys, native composers). */
	sendInput: (data: string) => void;
	/** Focus xterm's hidden textarea so the soft keyboard comes up. */
	focus: () => void;
	/** Reset the reconnect budget and redial (also the resume path). */
	retry: () => void;
}

interface TerminalWebViewProps {
	workspaceId: string;
	terminalId: string;
	routingKey: string;
	onStateChange: (state: TerminalConnectionState) => void;
	onControl: (message: TerminalControlMessage) => void;
}

type PageMessage =
	| { type: "ready" }
	| { type: "dial"; id: number; replay: "0" | "1" }
	| { type: "state"; state: TerminalConnectionState }
	| { type: "control"; message: TerminalControlMessage };

/**
 * Hosts the xterm.js page (terminalHtml.generated.ts) and speaks its bridge
 * protocol. The WebSocket lives inside the page so PTY output never crosses
 * the RN bridge; this side only signs dial URLs (fresh JWT per attempt, same
 * contract as web's TerminalConnection) and relays UI intents.
 */
export const TerminalWebView = forwardRef<
	TerminalWebViewHandle,
	TerminalWebViewProps
>(function TerminalWebView(
	{ workspaceId, terminalId, routingKey, onStateChange, onControl },
	ref,
) {
	const webViewRef = useRef<WebView>(null);
	// Callbacks go through refs so onMessage identity stays stable — remounting
	// the WebView on a parent re-render would drop the live socket.
	const onStateChangeRef = useRef(onStateChange);
	onStateChangeRef.current = onStateChange;
	const onControlRef = useRef(onControl);
	onControlRef.current = onControl;

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

	const buildDialUrl = useCallback(
		async (replay: "0" | "1"): Promise<string> => {
			const token = await getHostAuthToken();
			const base = getRelayUrl().replace(/^http/, "ws");
			const query = [
				`workspaceId=${encodeURIComponent(workspaceId)}`,
				"themeType=dark",
				...(replay === "0" ? ["replay=0"] : []),
				`token=${encodeURIComponent(token)}`,
			].join("&");
			return `${base}/hosts/${routingKey}/terminal/${encodeURIComponent(terminalId)}?${query}`;
		},
		[routingKey, terminalId, workspaceId],
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
		}),
		[postToPage],
	);

	return (
		<StyledWebView
			ref={webViewRef}
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
