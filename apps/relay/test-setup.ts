import { plugin } from "bun";

plugin({
	name: "cloudflare-workers",
	setup(build) {
		build.module("cloudflare:workers", () => ({
			loader: "object",
			exports: { DurableObject: class {}, env: {} },
		}));
	},
});
