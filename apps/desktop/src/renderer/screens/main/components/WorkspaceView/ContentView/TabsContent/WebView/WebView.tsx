import { useEffect, useRef } from "react";

interface WebViewProps {
	url: string;
}

export function WebView({ url }: WebViewProps) {
	const webviewRef = useRef<Electron.WebviewTag>(null);

	useEffect(() => {
		const webview = webviewRef.current;
		if (!webview) return;

		const handleDomReady = () => {
			console.log("WebView loaded:", url);
		};

		const handleDidFailLoad = (event: Electron.DidFailLoadEvent) => {
			console.error("WebView failed to load:", event.errorDescription);
		};

		webview.addEventListener("dom-ready", handleDomReady);
		webview.addEventListener("did-fail-load", handleDidFailLoad);

		return () => {
			webview.removeEventListener("dom-ready", handleDomReady);
			webview.removeEventListener("did-fail-load", handleDidFailLoad);
		};
	}, [url]);

	return (
		<div className="w-full h-full bg-background">
			<webview
				ref={webviewRef}
				src={url}
				className="w-full h-full"
				// @ts-expect-error - webview attributes not in React types
				allowpopups="true"
			/>
		</div>
	);
}
