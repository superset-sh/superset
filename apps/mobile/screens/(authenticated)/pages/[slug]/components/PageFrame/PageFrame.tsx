import {
	FRAME_CHANNEL,
	type FrameMessage,
	HOST_CHANNEL,
	type HostMessageBody,
} from "@superset/shared/page-comments-runtime";
import {
	PAGE_STORAGE_HOST_FLAG,
	type PageStorageFrameMessage,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "@superset/shared/page-storage";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useOpenLink } from "@/hooks/useOpenLink";

const BRIDGE = `(() => {
	window[${JSON.stringify(PAGE_STORAGE_HOST_FLAG)}] = true;
	if (window.__supersetCommentBridge) return;
	window.__supersetCommentBridge = true;
	const channels = ${JSON.stringify([FRAME_CHANNEL, STORAGE_FRAME_CHANNEL])};
	window.addEventListener("message", (event) => {
		const data = event.data;
		if (!data || !channels.includes(data.channel)) return;
		window.ReactNativeWebView?.postMessage(JSON.stringify(data));
	});
})();
true;`;

export interface PageFrameHandle {
	send: (message: HostMessageBody) => void;
	reload: () => void;
}

interface PageFrameProps {
	src: string;
	insetTop: number;
	onMessage: (message: FrameMessage) => void;
	onStorageMessage?: (message: PageStorageFrameMessage) => void;
	storageTicket?: () => Promise<string | null>;
	onLoadEnd: () => void;
	onError: () => void;
}

function sameOrigin(url: string, src: string): boolean {
	try {
		return new URL(url).origin === new URL(src).origin;
	} catch {
		return false;
	}
}

export const PageFrame = forwardRef<PageFrameHandle, PageFrameProps>(
	function PageFrame(
		{
			src,
			insetTop,
			onMessage,
			onStorageMessage,
			storageTicket,
			onLoadEnd,
			onError,
		},
		ref,
	) {
		const webViewRef = useRef<WebView>(null);
		const openLink = useOpenLink();
		const dialing = useRef(false);

		const connectStorage = async () => {
			if (!storageTicket || dialing.current) return;
			dialing.current = true;
			const url = await storageTicket().catch(() => null);
			dialing.current = false;
			if (!url) return;
			const payload = JSON.stringify({
				channel: STORAGE_HOST_CHANNEL,
				type: "connect",
				url,
			});
			webViewRef.current?.injectJavaScript(
				`window.postMessage(${payload}, "*"); true;`,
			);
		};

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
			let data: FrameMessage | PageStorageFrameMessage;
			try {
				data = JSON.parse(event.nativeEvent.data) as
					| FrameMessage
					| PageStorageFrameMessage;
			} catch {
				return;
			}
			if (data.channel === FRAME_CHANNEL) onMessage(data);
			if (data.channel !== STORAGE_FRAME_CHANNEL) return;
			if (data.type === "hello") void connectStorage();
			else onStorageMessage?.(data);
		};

		return (
			<WebView
				ref={webViewRef}
				source={{ uri: src }}
				style={{ flex: 1, backgroundColor: "transparent" }}
				injectedJavaScriptBeforeContentLoaded={BRIDGE}
				injectedJavaScript={BRIDGE}
				onMessage={handleMessage}
				onLoadEnd={onLoadEnd}
				onError={onError}
				onHttpError={onError}
				contentInset={{ top: insetTop, left: 0, right: 0, bottom: 0 }}
				contentInsetAdjustmentBehavior="never"
				automaticallyAdjustContentInsets={false}
				onShouldStartLoadWithRequest={(request) => {
					if (!request.isTopFrame) return true;
					if (sameOrigin(request.url, src)) return true;
					if (request.navigationType !== "click") return true;
					openLink(request.url);
					return false;
				}}
				allowsInlineMediaPlayback
			/>
		);
	},
);
