/// <reference types="vite/client" />

import type {
	DetailedHTMLProps,
	HTMLAttributes,
	Ref,
} from "react";
import type { WebviewTag } from "electron";

declare global {
	namespace JSX {
		interface IntrinsicElements {
			webview: DetailedHTMLProps<HTMLAttributes<WebviewTag>, WebviewTag> & {
				ref?: Ref<WebviewTag>;
				src?: string;
				partition?: string;
				preload?: string;
				useragent?: string;
				httpreferrer?: string;
				allowpopups?: boolean | string;
				disablewebsecurity?: boolean | string;
				webpreferences?: string;
			};
		}
	}
}
