import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";

if (process.env.NODE_ENV !== "production") {
	dotenvConfig({
		path: join(process.cwd(), "../../.env"),
		override: true,
		quiet: true,
	});
}

/**
 * The libvips shared library that sharp's prebuilt binary loads at runtime.
 *
 * `@img/sharp-<platform>` ships `sharp.node`, which loads libvips from the
 * sibling package `@img/sharp-libvips-<platform>` through the binary's rpath,
 * not through a `require()`, so a JavaScript tracer cannot follow the edge.
 * Turbopack special-cases sharp for exactly this, but its pattern
 * (`/sharp-(\w+-\w+).node$`) predates sharp 0.35 renaming the binary to
 * `sharp-<platform>-<version>.node`, so on Next 16.2.11 the library is left
 * out and the Vercel function boots without it. Every route that imports
 * `@superset/trpc` then failed at module load (the 2026-09-01 outage).
 * Upstream fixed the pattern in vercel/next.js#94845 (Next 16.3). Until that
 * upgrade this include does the same job; after it, the include is redundant
 * and harmless.
 *
 * It includes the package's real directory, which is where the already-traced
 * symlink beside the binary points, so the rpath lookup lands on the library.
 * Resolved from `packages/trpc`'s sharp rather than hard-coded, so it follows
 * the sharp version and the build host's platform, which is also the platform
 * whose `sharp.node` the tracer picks up: linux-x64 (glibc) on Vercel.
 */
function sharpLibvipsIncludes(): string[] {
	const platform = `${process.platform}-${process.arch}`;
	const require = createRequire(join(process.cwd(), "next.config.ts"));
	let sharpEntry: string;
	try {
		sharpEntry = require.resolve("sharp", {
			paths: [join(process.cwd(), "../../packages/trpc")],
		});
	} catch {
		// sharp is no longer a dependency of the router: nothing to ship.
		return [];
	}
	try {
		const platformPackage = require.resolve(`@img/sharp-${platform}/package`, {
			paths: [dirname(sharpEntry)],
		});
		const libvipsDir = realpathSync(
			join(dirname(platformPackage), "..", `sharp-libvips-${platform}`),
		);
		return [`${relative(process.cwd(), libvipsDir)}/**`];
	} catch (error) {
		throw new Error(
			`@img/sharp-${platform} and its libvips are not installed, so the API bundle cannot include the library sharp loads at runtime`,
			{ cause: error },
		);
	}
}

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },

	// Every route: `@superset/trpc` is imported by the tRPC and MCP handlers
	// and by two dozen integration and job routes, and a missed one is an
	// outage. libvips is ~18MB, which the function bundle can afford.
	outputFileTracingIncludes: {
		"/**": sharpLibvipsIncludes(),
	},

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
			},
			{
				protocol: "https",
				hostname: "static.supersetusercontent.com",
			},
		],
	},
};

export default withSentryConfig(config, {
	org: "superset-sh",
	project: "api",
	silent: !process.env.CI,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
	disableLogger: true,
	automaticVercelMonitors: true,
});
