export interface NavigationEvent {
	type:
		| "did-start-loading"
		| "did-stop-loading"
		| "did-navigate"
		| "did-navigate-in-page"
		| "page-title-updated"
		| "page-favicon-updated"
		| "did-fail-load";
	url?: string;
	title?: string;
	favicons?: string[];
	errorCode?: number;
	errorDescription?: string;
	validatedURL?: string;
}
