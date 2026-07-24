/**
 * Client env for the Vite SPA. Reuses the monorepo's NEXT_PUBLIC_* vars
 * (exposed via envPrefix in vite.config.ts). Field names mirror the other
 * apps so ported components keep working.
 */
export const env = {
	NEXT_PUBLIC_API_URL:
		import.meta.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
	NEXT_PUBLIC_WEB_URL:
		import.meta.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000",
	NEXT_PUBLIC_POSTHOG_KEY: import.meta.env.NEXT_PUBLIC_POSTHOG_KEY as
		| string
		| undefined,
	NEXT_PUBLIC_POSTHOG_HOST:
		import.meta.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
	DEV: import.meta.env.DEV,
};
