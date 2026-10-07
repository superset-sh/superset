import worker from "./index.js";

export { HostTunnel } from "./index.js";

function placementKv(disk) {
	const urlFor = (key) => `http://placement/${encodeURIComponent(key)}`;
	return {
		async get(key, type) {
			const response = await disk.fetch(urlFor(key));
			if (response.status === 404) {
				await response.body?.cancel().catch(() => {});
				return null;
			}
			if (!response.ok) {
				await response.body?.cancel().catch(() => {});
				throw new Error("Relay placement read failed");
			}
			const text = await response.text();
			if (type !== "json") return text;
			try {
				return JSON.parse(text);
			} catch {
				return null;
			}
		},
		async put(key, value) {
			const response = await disk.fetch(urlFor(key), {
				method: "PUT",
				body: value,
			});
			if (!response.ok) {
				await response.body?.cancel().catch(() => {});
				throw new Error("Relay placement write failed");
			}
			await response.body?.cancel().catch(() => {});
		},
	};
}

export default {
	fetch(request, env, ctx) {
		return worker.fetch(
			request,
			{ ...env, PLACEMENT: placementKv(env.PLACEMENT_DISK) },
			ctx,
		);
	},
};
