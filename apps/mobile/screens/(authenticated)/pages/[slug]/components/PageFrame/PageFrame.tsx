import {
	FRAME_CHANNEL,
	type FrameMessage,
	HOST_CHANNEL,
	type HostMessageBody,
} from "@superset/shared/page-comments-runtime";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useOpenLink } from "@/hooks/useOpenLink";

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
	reload: () => void;
}

interface PageFrameProps {
	src: string;
	onMessage: (message: FrameMessage) => void;
	onLoadEnd: () => void;
	onError: () => void;
}

function documentUrl(url: string): string {
	return url.split("#")[0];
}

export const PageFrame = forwardRef<PageFrameHandle, PageFrameProps>(
	function PageFrame({ src, onMessage, onLoadEnd, onError }, ref) {
		const webViewRef = useRef<WebView>(null);
		const openLink = useOpenLink();

		useImperativeHandle(ref, () => ({
			send: (message) => {
				const payload = JSON.stringify({ channel: HOST_CHANNEL, ...message });
				webViewRef.current?.injectJavaScript(
					`window.postMessage(${payload}, "*"); true;`,
				);
			},
			reload: () => webViewRef.current?.reload(),
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
				onError={onError}
				onHttpError={onError}
				onShouldStartLoadWithRequest={(request) => {
					if (!request.isTopFrame) return true;
					if (documentUrl(request.url) === documentUrl(src)) return true;
					if (request.navigationType === "click") openLink(request.url);
					return false;
				}}
				allowsInlineMediaPlayback
			/>
		);
	},
);
