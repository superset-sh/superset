/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly NEXT_PUBLIC_API_URL?: string;
	readonly NEXT_PUBLIC_WEB_URL?: string;
	readonly NEXT_PUBLIC_POSTHOG_KEY?: string;
	readonly NEXT_PUBLIC_POSTHOG_HOST?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
