import { expect, test } from "bun:test";
import { resolveGitlabProjectClone } from "./resolve-clone";
import { SsrfError } from "./ssrf";
import type { GitlabProjectCredentials } from "./types";

const credentials: GitlabProjectCredentials = {
	connectionId: "CONNECTION_A",
	token: "FAKE_TOKEN",
	config: {
		host: "git.example.invalid:8443",
		groupPath: "Acme/Team",
		scopeKind: "group",
	},
};
const metadata = {
	id: 17,
	path_with_namespace: "Acme/Team/widget",
	http_url_to_repo: "https://git.example.invalid:8443/Acme/Team/widget.git",
	default_branch: "Release/Current",
};

test("clone resolution verifies the selected host, exact path and canonical metadata", async () => {
	const requests: unknown[][] = [];
	const resolved = await resolveGitlabProjectClone(
		credentials,
		metadata.http_url_to_repo,
		async (...args) => {
			requests.push(args);
			return Response.json(metadata);
		},
	);
	expect(requests).toEqual([
		[
			"https://git.example.invalid:8443",
			"FAKE_TOKEN",
			"/projects/Acme%2FTeam%2Fwidget",
		],
	]);
	expect(resolved).toEqual({
		connectionId: "CONNECTION_A",
		projectId: "17",
		pathWithNamespace: "Acme/Team/widget",
		cloneUrl: metadata.http_url_to_repo,
		defaultBranch: "Release/Current",
		host: "git.example.invalid:8443",
	});
});

test("foreign hosts, case variants and sibling groups fail before credential transport", async () => {
	let sends = 0;
	for (const url of [
		"https://github.com/Acme/Team/widget.git",
		"https://git.other.invalid:8443/Acme/Team/widget.git",
		"https://git.example.invalid/Acme/Team/widget.git",
		"https://git.example.invalid:8443/acme/Team/widget.git",
		"https://git.example.invalid:8443/Acme/Team-other/widget.git",
		"https://git.example.invalid:8443/Acme/Team/../Other/widget.git",
		"not a remote",
	]) {
		await expect(
			resolveGitlabProjectClone(credentials, url, async () => {
				sends++;
				return Response.json(metadata);
			}),
		).rejects.toMatchObject({ name: "GitlabCloneError" });
	}
	expect(sends).toBe(0);
});

test("missing credentials return the existing reconnect reason without a request", async () => {
	let sends = 0;
	await expect(
		resolveGitlabProjectClone(null, metadata.http_url_to_repo, async () => {
			sends++;
			return Response.json(metadata);
		}),
	).rejects.toMatchObject({
		reason: "token",
		message: "Reconnect GitLab to clone this project",
	});
	expect(sends).toBe(0);
});

test("API rename, unsafe clone metadata and wrong instance never become checkouts", async () => {
	for (const changed of [
		{ ...metadata, path_with_namespace: "Acme/Team/other" },
		{
			...metadata,
			http_url_to_repo: "https://git.other.invalid:8443/Acme/Team/widget.git",
		},
		{
			...metadata,
			http_url_to_repo:
				"https://token@git.example.invalid:8443/Acme/Team/widget.git",
		},
		{
			...metadata,
			http_url_to_repo:
				"https://git.example.invalid:8443/Acme/Team/widget.git?token=secret",
		},
		{ ...metadata, id: 0 },
		{ ...metadata, id: Number.MAX_SAFE_INTEGER + 1 },
	]) {
		await expect(
			resolveGitlabProjectClone(
				credentials,
				metadata.http_url_to_repo,
				async () => Response.json(changed),
			),
		).rejects.toMatchObject({ name: "GitlabCloneError" });
	}
});

test("invalid origins and unsafe returned clone URLs retain the existing host error", async () => {
	for (const host of [
		"http://git.example.invalid",
		"token@git.example.invalid",
		"git.example.invalid/path",
	]) {
		await expect(
			resolveGitlabProjectClone(
				{ ...credentials, config: { ...credentials.config, host } },
				metadata.http_url_to_repo,
				async () => {
					throw new Error("Unexpected credential send");
				},
			),
		).rejects.toMatchObject({
			name: "GitlabCloneError",
			reason: "host",
			message: "That URL is not on the connected GitLab host",
		});
	}
	for (const cloneUrl of [
		"https://git.other.invalid:8443/Acme/Team/widget.git",
		"https://token@git.example.invalid:8443/Acme/Team/widget.git",
		`${metadata.http_url_to_repo}?token=secret`,
	]) {
		await expect(
			resolveGitlabProjectClone(
				credentials,
				metadata.http_url_to_repo,
				async () => Response.json({ ...metadata, http_url_to_repo: cloneUrl }),
			),
		).rejects.toMatchObject({ reason: "host" });
	}
	await expect(
		resolveGitlabProjectClone(
			credentials,
			metadata.http_url_to_repo,
			async () => {
				throw new SsrfError("Fixture blocked DNS answer");
			},
		),
	).rejects.toMatchObject({ reason: "host" });
});

test("API rejection, malformed body and transport failure remain failures", async () => {
	for (const response of [
		new Response("", { status: 401 }),
		new Response("", { status: 404 }),
		new Response("", { status: 503 }),
		new Response("not JSON"),
	]) {
		await expect(
			resolveGitlabProjectClone(
				credentials,
				metadata.http_url_to_repo,
				async () => response,
			),
		).rejects.toMatchObject({ reason: "project" });
	}
	const failure = new Error("FAKE_NETWORK_ERROR");
	await expect(
		resolveGitlabProjectClone(
			credentials,
			metadata.http_url_to_repo,
			async () => {
				throw failure;
			},
		),
	).rejects.toBe(failure);
});

test("SSH and web selectors resolve to the verified HTTPS repository with its default", async () => {
	const snapshot = {
		...credentials,
		config: { ...credentials.config, host: "git.example.invalid" },
	};
	const body = {
		...metadata,
		http_url_to_repo: "https://git.example.invalid/Acme/Team/widget.git",
		default_branch: null,
	};
	for (const url of [
		"git@git.example.invalid:Acme/Team/widget.git",
		"ssh://git@git.example.invalid:2222/Acme/Team/widget.git",
		"https://git.example.invalid/Acme/Team/widget/-/tree/Release",
	]) {
		expect(
			await resolveGitlabProjectClone(snapshot, url, async () =>
				Response.json(body),
			),
		).toEqual({
			connectionId: "CONNECTION_A",
			projectId: "17",
			pathWithNamespace: "Acme/Team/widget",
			cloneUrl: body.http_url_to_repo,
			defaultBranch: "main",
			host: "git.example.invalid",
		});
	}
});
