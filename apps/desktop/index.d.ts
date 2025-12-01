/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes, Ref } from "react";
import type { WebviewTag } from "electron";

interface ImportMetaEnv {
	readonly DEV_SERVER_PORT?: string;
}

// biome-ignore lint/correctness/noUnusedVariables: Augments global import.meta type for Vite
interface ImportMeta {
	readonly env: ImportMetaEnv;
}

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
