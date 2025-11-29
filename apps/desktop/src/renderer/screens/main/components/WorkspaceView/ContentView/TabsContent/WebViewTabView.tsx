import type { WebViewTab } from "renderer/stores/tabs/types";
import { WebView } from "./WebView";

interface WebViewTabViewProps {
	tab: WebViewTab;
}

export function WebViewTabView({ tab }: WebViewTabViewProps) {
	return (
		<div className="w-full h-full overflow-hidden bg-background">
			<WebView url={tab.url} />
		</div>
	);
}
