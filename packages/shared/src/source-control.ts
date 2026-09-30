export type SourceControlProvider = "github" | "gitlab";
export type RepositoryRequestKind = "issue" | "merge_request";

export interface RepositoryIdentity {
	provider: SourceControlProvider;
	instance: string;
	repoPath: string;
	owner: string;
	name: string;
	url: string;
	projectId?: number;
}

export interface RepositoryRequestIdentity {
	repository: RepositoryIdentity;
	kind: RepositoryRequestKind;
	iid: number;
}

export interface ParseRepositoryRemoteOptions {
	gitlabHosts?: readonly string[];
	gitlabSshHosts?: readonly { sshHost: string; instance: string }[];
}

function normalizeConfiguredOrigin(value: string): string | null {
	try {
		const url = new URL(value.includes("://") ? value : `https://${value}`);
		if (
			url.username ||
			url.password ||
			url.pathname !== "/" ||
			url.search ||
			url.hash ||
			!["http:", "https:"].includes(url.protocol)
		) {
			return null;
		}
		return url.origin.toLowerCase();
	} catch {
		return null;
	}
}

function matchesSshHost(remoteOrigin: string, configuredHost: string): boolean {
	try {
		const configured = new URL(`ssh://${configuredHost}`);
		const remote = new URL(remoteOrigin);
		return (
			!configured.username &&
			!configured.password &&
			(!configured.pathname || configured.pathname === "/") &&
			!configured.search &&
			!configured.hash &&
			configured.hostname === remote.hostname &&
			(!configured.port || configured.port === remote.port)
		);
	} catch {
		return false;
	}
}

function parseRemoteLocation(
	remoteUrl: string,
): { origin: string; path: string; transport: "http" | "ssh" } | null {
	const trimmed = remoteUrl.trim();
	const scp = trimmed.includes("://")
		? null
		: /^(?:[^@\s/:]+@)?(?<host>[^\s/:]+):(?<path>[^\s]+)$/.exec(trimmed);
	if (scp?.groups?.host && scp.groups.path) {
		return {
			origin: `https://${scp.groups.host.toLowerCase()}`,
			path: scp.groups.path,
			transport: "ssh",
		};
	}
	try {
		const url = new URL(trimmed);
		if (!["https:", "http:", "ssh:"].includes(url.protocol)) return null;
		if (url.password || !url.hostname) return null;
		return {
			origin:
				url.protocol === "ssh:"
					? `https://${url.host.toLowerCase()}`
					: url.origin.toLowerCase(),
			path: url.pathname,
			transport: url.protocol === "ssh:" ? "ssh" : "http",
		};
	} catch {
		return null;
	}
}

export function parseRepositoryRemote(
	remoteUrl: string,
	options: ParseRepositoryRemoteOptions = {},
): RepositoryIdentity | null {
	const location = parseRemoteLocation(remoteUrl);
	if (!location) return null;
	const normalizedPath = location.path
		.replace(/^\/+|\/+$/g, "")
		.replace(/\.git$/i, "");
	let repoPath: string;
	try {
		repoPath = decodeURIComponent(normalizedPath);
	} catch {
		return null;
	}
	const segments = repoPath.split("/");
	if (
		segments.length < 2 ||
		segments.some((segment) => !segment || segment === "." || segment === "..")
	) {
		return null;
	}
	const configured =
		options.gitlabHosts
			?.map(normalizeConfiguredOrigin)
			.filter((origin): origin is string => origin !== null) ?? [];
	const remoteHostname = new URL(location.origin).hostname;
	const sshAlias =
		location.transport === "ssh" &&
		!["github.com", "gitlab.com"].includes(remoteHostname)
			? options.gitlabSshHosts?.find((mapping) =>
					matchesSshHost(location.origin, mapping.sshHost),
				)
			: undefined;
	const configuredAliasOrigin = sshAlias
		? normalizeConfiguredOrigin(sshAlias.instance)
		: null;
	const aliasOrigin =
		configuredAliasOrigin &&
		new URL(configuredAliasOrigin).hostname !== "github.com"
			? configuredAliasOrigin
			: null;
	const origin =
		aliasOrigin ??
		(!["github.com", "gitlab.com"].includes(remoteHostname)
			? configured.find((configuredOrigin) => {
					const configuredUrl = new URL(configuredOrigin);
					const remoteUrl = new URL(location.origin);
					return location.transport === "ssh"
						? configuredUrl.hostname === remoteUrl.hostname
						: configuredOrigin === location.origin;
				})
			: null) ??
		(location.transport === "ssh" &&
		["github.com", "gitlab.com"].includes(new URL(location.origin).hostname)
			? `https://${new URL(location.origin).hostname}`
			: location.origin);
	const hostname = new URL(origin).hostname;
	const provider: SourceControlProvider | null =
		hostname === "github.com"
			? "github"
			: hostname === "gitlab.com" ||
					configured.includes(origin) ||
					aliasOrigin === origin
				? "gitlab"
				: null;
	if (!provider) return null;
	if (
		provider === "github" &&
		(segments.length !== 2 || origin !== "https://github.com")
	) {
		return null;
	}
	const owner = segments.slice(0, -1).join("/");
	const name = segments.at(-1) as string;
	return {
		provider,
		instance: origin,
		repoPath,
		owner,
		name,
		url: `${origin}/${repoPath}`,
	};
}

export function repositoryIdentityKey(
	identity: Pick<RepositoryIdentity, "provider" | "instance" | "repoPath">,
): string {
	return JSON.stringify([
		identity.provider,
		identity.instance.toLowerCase(),
		identity.repoPath.toLowerCase(),
	]);
}

export function requestIdentityKey(
	identity: RepositoryRequestIdentity,
): string {
	return JSON.stringify([
		repositoryIdentityKey(identity.repository),
		identity.kind,
		identity.iid,
	]);
}
