import {
	FRAME_CHANNEL,
	type FrameMessage,
	HOST_CHANNEL,
	type HostMessageBody,
} from "@superset/shared/page-comments-runtime";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { openUrl } from "@/lib/open-url";

/**
 * The comment runtime inside the page posts with `parent.postMessage`. In a
 * WebView the page is the top document, so `parent === window` and that lands
 * as a message event on its own window — this forwards those to the native
 * side. Host messages travel the other way as a plain `window.postMessage`,
 * which is what the runtime already listens for. Neither side needs changing.
 */
const BRIDGE = `(() => {
	if (window.__supersetCommentBridge) return;
	window.__supersetCommentBridge = true;
	window.addEventListener("message", (event) => {
		const data = event.data;
		if (!data || data.channel !== ${JSON.stringify(FRAME_CHANNEL)}) return;
		window.ReactNativeWebView.postMessage(JSON.stringify(data));
	});
})();
true;`;

export interface PageFrameHandle {
	send: (message: HostMessageBody) => void;
}

interface PageFrameProps {
	src: string;
	onMessage: (message: FrameMessage) => void;
	onLoadEnd: () => void;
}

export const PageFrame = forwardRef<PageFrameHandle, PageFrameProps>(
	function PageFrame({ src, onMessage, onLoadEnd }, ref) {
		const webViewRef = useRef<WebView>(null);

		useImperativeHandle(ref, () => ({
			send: (message) => {
				const payload = JSON.stringify({ channel: HOST_CHANNEL, ...message });
				webViewRef.current?.injectJavaScript(
					`window.postMessage(${payload}, "*"); true;`,
				);
			},
		}));

		const handleMessage = (event: WebViewMessageEvent) => {
			let data: FrameMessage;
			try {
				data = JSON.parse(event.nativeEvent.data) as FrameMessage;
			} catch {
				return;
			}
			if (data.channel !== FRAME_CHANNEL) return;
			onMessage(data);
		};

		return (
			<WebView
				ref={webViewRef}
				source={{ uri: src }}
				style={{ flex: 1, backgroundColor: "transparent" }}
				injectedJavaScript={BRIDGE}
				onMessage={handleMessage}
				onLoadEnd={onLoadEnd}
				onShouldStartLoadWithRequest={(request) => {
					if (request.url === src) return true;
					if (request.navigationType === "click") openUrl(request.url);
					return false;
				}}
				allowsInlineMediaPlayback
			/>
		);
	},
);
