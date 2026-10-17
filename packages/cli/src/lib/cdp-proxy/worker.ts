import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { z } from "zod";
import { createHostTokenProvider } from "../host-target/exchangeApiKey";
import {
	type ProxyManifest,
	proxyId,
	removeProxy,
	tryProxyLock,
} from "./registry";
import { startCdpProxy } from "./server";

const configuration = z.object({
	id: proxyId,
	apiKey: z.string().regex(/^sk_(live|test)_/),
	upstreamUrl: z.url().refine((value) => {
		const url = new URL(value);
		return (
			(url.protocol === "ws:" || url.protocol === "wss:") &&
			!url.username &&
			!url.password &&
			!url.searchParams.has("token")
		);
	}),
});

export async function runCdpProxyWorker(
	signal: AbortSignal,
	instance: string,
): Promise<void> {
	proxyId.parse(instance);
	const lines = createInterface({ input: process.stdin })[
		Symbol.asyncIterator
	]();
	const startup = setTimeout(() => {
		process.stdin.destroy();
	}, 10_000);
	let proxy: ReturnType<typeof startCdpProxy> | undefined;
	let manifest: ProxyManifest | undefined;
	const stop = () => {
		proxy?.stop();
		process.stdin.destroy();
	};
	signal.addEventListener("abort", stop, { once: true });
	try {
		const first = await lines.next();
		if (first.done || first.value.length > 16_384)
			throw new Error("Invalid CDP proxy configuration");
		const config = configuration.parse(JSON.parse(first.value));
		const token = randomBytes(32).toString("hex");
		const stopToken = randomBytes(32).toString("hex");
		proxy = startCdpProxy({
			...config,
			token,
			stopToken,
			getToken: createHostTokenProvider(config.apiKey),
		});
		manifest = {
			id: config.id,
			pid: process.pid,
			instance,
			endpoint: proxy.endpoint,
			token,
			stopToken,
		};
		if (signal.aborted) stop();
		process.stdout.write(`${JSON.stringify(manifest)}\n`);
		const acknowledgement = await lines.next();
		clearTimeout(startup);
		if (acknowledgement.done || acknowledgement.value !== "ready") stop();
		await proxy.closed;
	} finally {
		clearTimeout(startup);
		proxy?.stop();
		signal.removeEventListener("abort", stop);
		if (manifest) {
			const release = tryProxyLock(manifest.id);
			if (release) {
				try {
					removeProxy(manifest);
				} finally {
					release();
				}
			}
		}
		await lines.return?.();
	}
}
