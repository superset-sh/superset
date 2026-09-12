declare module "@novnc/novnc" {
	interface RFBEventMap {
		connect: CustomEvent<void>;
		disconnect: CustomEvent<{ clean: boolean }>;
		credentialsrequired: CustomEvent<{ types: string[] }>;
		securityfailure: CustomEvent<{ status: number; reason: string }>;
		clipboard: CustomEvent<{ text: string }>;
	}

	export default class RFB extends EventTarget {
		constructor(
			target: HTMLElement,
			url: string,
			options?: {
				shared?: boolean;
				credentials?: { username?: string; password?: string; target?: string };
				wsProtocols?: string[];
			},
		);
		scaleViewport: boolean;
		resizeSession: boolean;
		viewOnly: boolean;
		focusOnClick: boolean;
		disconnect(): void;
		focus(): void;
		blur(): void;
		addEventListener<K extends keyof RFBEventMap>(
			type: K,
			listener: (event: RFBEventMap[K]) => void,
		): void;
		removeEventListener<K extends keyof RFBEventMap>(
			type: K,
			listener: (event: RFBEventMap[K]) => void,
		): void;
	}
}
