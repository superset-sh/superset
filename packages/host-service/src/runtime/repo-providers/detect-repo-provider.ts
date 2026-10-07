import {
	type ParsedRemote,
	parseGitRemote,
	type RepoProvider,
} from "@superset/shared/git-remote";

export interface DetectRepoProviderOptions {
	hint?: { provider: string | null; url: string | null };
	getGitLabToken?: (host: string) => Promise<string | null>;
}

async function readVersionMetadata(response: Response): Promise<unknown> {
	const reader = response.body?.getReader();
	if (!reader) return null;
	let text = "";
	let bytes = 0;
	const decoder = new TextDecoder();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return JSON.parse(text + decoder.decode());
			bytes += value.byteLength;
			if (bytes > 4096) return null;
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		await reader.cancel();
	}
}

export async function detectRepoProvider(
	remote: ParsedRemote,
	options: DetectRepoProviderOptions = {},
): Promise<RepoProvider | null> {
	if (remote.provider !== "unknown") return remote.provider;
	const hint = options.hint;
	if (
		hint?.provider === "gitlab" &&
		hint.url &&
		parseGitRemote(hint.url)?.host === remote.host
	)
		return "gitlab";
	try {
		const init = {
			headers: { Accept: "application/json" },
			redirect: "error",
			signal: AbortSignal.timeout(3000),
		} as const;
		const url = `https://${remote.host}/api/v4/version`;
		let response = await fetch(url, init);
		if (response.status === 401 && options.getGitLabToken) {
			const token = await options.getGitLabToken(remote.host);
			if (token) {
				response = await fetch(url, {
					...init,
					headers: { ...init.headers, Authorization: `Bearer ${token}` },
				});
			}
		}
		if (!response.ok) return null;
		const data = await readVersionMetadata(response);
		if (
			typeof data === "object" &&
			data !== null &&
			"version" in data &&
			typeof data.version === "string" &&
			/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(data.version) &&
			"revision" in data &&
			typeof data.revision === "string" &&
			/^[a-f\d]{7,64}$/i.test(data.revision)
		)
			return "gitlab";
	} catch (error) {
		console.warn("[repo-provider] GitLab detection failed", {
			host: remote.host,
			error,
		});
		return null;
	}
	return null;
}
