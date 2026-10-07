import { expect, test } from "bun:test";
import { gitlabAccountIdentity, gitlabScopeAllows } from "./scope";

test("group and project boundaries distinguish namespaces and preserve path case", () => {
	const group = { groupPath: "Acme/Team", scopeKind: "group" as const };
	for (const path of ["Acme/Team/widget", "Acme/Team/sub/widget"])
		expect(gitlabScopeAllows(group, path)).toBe(true);
	for (const path of [
		"Acme/Team",
		"Acme/Team-other/widget",
		"acme/team/widget",
		"Other/Team/widget",
		null,
		undefined,
	])
		expect(gitlabScopeAllows(group, path)).toBe(false);
	const project = {
		groupPath: "Acme/Team/widget",
		scopeKind: "project" as const,
	};
	expect(gitlabScopeAllows(project, "Acme/Team/widget")).toBe(true);
	for (const path of ["Acme/Team/widget-more", "Acme/Team/widget/sub"])
		expect(gitlabScopeAllows(project, path)).toBe(false);
	expect(
		gitlabScopeAllows({ groupPath: "Acme/Team/widget" }, "Acme/Team/widget"),
	).toBe(true);
});
test("dot segments, empty segments and encoded separators never broaden scope", () => {
	for (const path of [
		"acme/../other/widget",
		"acme/./widget",
		"acme//widget",
		"acme/%2e%2e/other/widget",
		"acme/sub%2f..%2fother/widget",
		"acme/sub\\other/widget",
		"acme/widget?query",
		"acme/widget#fragment",
	])
		expect(
			gitlabScopeAllows({ groupPath: "acme", scopeKind: "group" }, path),
		).toBe(false);
	for (const groupPath of ["acme/", "/acme", "acme/..", "acme//team", ""])
		expect(
			gitlabScopeAllows(
				{ groupPath, scopeKind: "group" },
				`${groupPath}/widget`,
			),
		).toBe(false);
});
test("account identity includes exact provider instance, HTTPS port, scope kind and path", () => {
	expect(
		gitlabAccountIdentity("GITLAB.ONE:8443", "project", "Acme/widget"),
	).toBe("gitlab.one:8443:project:Acme/widget");
	const identity = gitlabAccountIdentity(
		"gitlab.one",
		"project",
		"Acme/widget",
	);
	for (const other of [
		gitlabAccountIdentity("gitlab.two", "project", "Acme/widget"),
		gitlabAccountIdentity("gitlab.one:8443", "project", "Acme/widget"),
		gitlabAccountIdentity("gitlab.one", "group", "Acme/widget"),
		gitlabAccountIdentity("gitlab.one", "project", "acme/widget"),
	])
		expect(other).not.toBe(identity);
	for (const host of [
		"github.com@evil.test",
		"gitlab.one/path",
		"gitlab.one?query",
		"gitlab.one:invalid",
	])
		expect(() =>
			gitlabAccountIdentity(host, "project", "Acme/widget"),
		).toThrow();
});

test("control characters and missing project namespaces cannot select an account", () => {
	for (const character of ["\u0000", "\u001f", "\u007f"]) {
		const path = `acme/${character}widget`;
		expect(
			gitlabScopeAllows({ groupPath: "acme", scopeKind: "group" }, path),
		).toBe(false);
		expect(
			gitlabScopeAllows({ groupPath: path, scopeKind: "project" }, path),
		).toBe(false);
		expect(() =>
			gitlabAccountIdentity("git.example.invalid", "project", path),
		).toThrow();
	}
	expect(() =>
		gitlabAccountIdentity("git.example.invalid", "project", "Acme"),
	).toThrow();
	expect(gitlabAccountIdentity("git.example.invalid", "group", "Acme")).toBe(
		"git.example.invalid:group:Acme",
	);
});
