import { describe, expect, test } from "bun:test";
import type { GitLabConfig } from "@superset/db/schema";
import {
	gitlabAutomationCheckoutNumber,
	gitlabTriggerMatches,
} from "@superset/shared/automation-matching";
import {
	gitlabDeliverySchema,
	normalizeGitlabDelivery,
} from "./normalizeGitlabDelivery";

const config: GitLabConfig = {
	provider: "gitlab",
	host: "gitlab.example:8443",
	groupPath: "team/project",
	scopeKind: "project",
	scopeId: "7",
	auth: "token",
	webhookSecret: "test-secret",
};
const project = {
	id: 7,
	path_with_namespace: "team/project",
	web_url: "https://gitlab.example:8443/team/project",
};
const ancestry = { source_project_id: 7, target_project_id: 7 };
function normalize(payload: unknown, selected = config) {
	return normalizeGitlabDelivery({
		organizationId: "organization",
		connectionId: "connection",
		config: selected,
		deliveryId: "delivery",
		payload: gitlabDeliverySchema.parse(payload),
	});
}
function recorded(payload: unknown, selected = config) {
	const result = normalize(payload, selected);
	if ("skip" in result) throw new Error(result.skip);
	return result;
}
function mr(attributes: Record<string, unknown> = {}) {
	return {
		object_kind: "merge_request",
		project,
		user: { id: 12, username: "actor" },
		object_attributes: {
			action: "open",
			iid: 3,
			source_branch: "refs/heads/feature",
			...ancestry,
			...attributes,
		},
	};
}
function dispatchEvent(payload: unknown) {
	const result = recorded(payload);
	const event = result.dispatch?.event;
	if (!event || event.provider !== "gitlab")
		throw new Error("Expected GitLab dispatch");
	return event;
}

describe("official GitLab project descriptors", () => {
	test("accepts the complete official MR source/target object payload", () => {
		expect(gitlabDeliverySchema.safeParse(officialMergeRequest).success).toBe(
			true,
		);
		const fixture = structuredClone(officialMergeRequest);
		fixture.project.web_url = fixture.project.web_url.replace(
			"http:",
			"https:",
		);
		fixture.object_attributes.url = fixture.object_attributes.url.replace(
			"http:",
			"https:",
		);
		fixture.object_attributes.source.web_url =
			fixture.object_attributes.source.web_url.replace("http:", "https:");
		fixture.object_attributes.target.web_url =
			fixture.object_attributes.target.web_url.replace("http:", "https:");
		const result = recorded(fixture, {
			...config,
			host: "gitlab.example.com",
			groupPath: fixture.project.path_with_namespace,
			scopeId: "2",
		});
		expect(result.dispatch?.event).toMatchObject({
			provider: "gitlab",
			names: ["merge_request.opened"],
			repositoryId: "2",
			isFork: false,
		});
		expect(
			gitlabAutomationCheckoutNumber(
				"https://gitlab.example.com/flightjs/flight-management.git",
				result.event.payload,
			),
		).toBe(16);
	});
	test("source interpretation follows event kind", () => {
		expect(gitlabDeliverySchema.safeParse(mr({ source: "push" })).success).toBe(
			false,
		);
		expect(
			gitlabDeliverySchema.safeParse({
				object_kind: "pipeline",
				project,
				object_attributes: { source: { id: 7 } },
			}).success,
		).toBe(false);
		expect(
			gitlabDeliverySchema.safeParse({
				object_kind: "pipeline",
				project,
				object_attributes: { source: "push" },
			}).success,
		).toBe(true);
	});
	test("descriptor IDs must be positive safe numeric IDs", () => {
		for (const value of [{}, { name: "Missing identity" }, [], true]) {
			expect(
				gitlabDeliverySchema.safeParse(mr({ source: value })).success,
			).toBe(false);
			expect(
				gitlabDeliverySchema.safeParse(mr({ target: value })).success,
			).toBe(false);
		}
		for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "7"]) {
			for (const descriptor of ["source", "target"]) {
				expect(
					gitlabDeliverySchema.safeParse(mr({ [descriptor]: { id } })).success,
				).toBe(false);
				expect(
					gitlabDeliverySchema.safeParse({
						...mr(),
						merge_request: { ...ancestry, [descriptor]: { id } },
					}).success,
				).toBe(false);
			}
		}
	});
	test("conflicting descriptors cannot turn ancestry into a trusted same-project MR", () => {
		for (const descriptor of ["source", "target"]) {
			for (const value of [
				{ id: 8 },
				{ id: 7, path_with_namespace: "other/project" },
				{ id: 7, web_url: "https://foreign.example/team/project" },
				null,
			]) {
				const direct = recorded(mr({ [descriptor]: value }));
				expect(direct.dispatch).toBeNull();
				expect(
					gitlabAutomationCheckoutNumber(
						"https://gitlab.example:8443/team/project.git",
						direct.event.payload,
					),
				).toBeNull();
				const embedded = recorded({
					object_kind: "note",
					project,
					object_attributes: { noteable_type: "MergeRequest" },
					merge_request: { iid: 3, ...ancestry, [descriptor]: value },
				});
				expect(embedded.dispatch).toBeNull();
			}
		}
	});
	test("consistent optional project descriptors preserve MR and note dispatch", () => {
		const descriptor = {
			id: 7,
			path_with_namespace: project.path_with_namespace,
			web_url: project.web_url,
		};
		expect(
			dispatchEvent(mr({ source: descriptor, target: descriptor })).isFork,
		).toBe(false);
		expect(
			dispatchEvent({
				object_kind: "note",
				project,
				object_attributes: { noteable_type: "MergeRequest" },
				merge_request: { ...ancestry, source: descriptor, target: descriptor },
			}).isFork,
		).toBe(false);
	});
});

describe("GitLab delivery provenance", () => {
	test("carries selected host, ancestry and checkout identity into real matchers", () => {
		const result = recorded(mr({ title: "Feature" }));
		const event = dispatchEvent(mr());
		expect(event).toMatchObject({
			host: config.host,
			repositoryId: "7",
			projectPath: "team/project",
			isFork: false,
			mergeRequest: { sourceProjectId: "7", targetProjectId: "7" },
			ref: "feature",
			actorId: "12",
			actorLogin: "actor",
		});
		expect(
			gitlabTriggerMatches(
				{
					event: "merge_request.opened",
					projects: { mode: "any" },
					branches: { mode: "any" },
					labels: { mode: "any" },
					includeForks: false,
				},
				event,
			),
		).toEqual({ matches: true });
		expect(
			gitlabAutomationCheckoutNumber(
				"https://gitlab.example:8443/team/project.git",
				result.event.payload,
			),
		).toBe(3);
		expect(
			gitlabAutomationCheckoutNumber(
				"https://gitlab.example/team/project.git",
				result.event.payload,
			),
		).toBeNull();
		expect(result.event).toMatchObject({
			organizationId: "organization",
			integrationConnectionId: "connection",
			externalEventId: "delivery",
			title: "Feature",
			repositoryId: "7",
		});
	});

	test.each([
		{ source_project_id: undefined },
		{ target_project_id: undefined },
		{ source_project_id: 8 },
		{ source_project_id: 8, target_project_id: 8 },
	])("never dispatches missing, forked or foreign ancestry %j", (attributes) => {
		const result = recorded(mr(attributes));
		expect(result.dispatch).toBeNull();
		expect(
			gitlabAutomationCheckoutNumber(
				"https://gitlab.example:8443/team/project.git",
				result.event.payload,
			),
		).toBeNull();
	});

	test("retains MR note context when embedded ancestry is absent or incomplete", () => {
		for (const merge_request of [
			undefined,
			null,
			{ iid: 3 },
			{ source_project_id: 7 },
		]) {
			const result = recorded({
				object_kind: "note",
				project,
				object_attributes: { noteable_type: "MergeRequest", note: "hello" },
				merge_request,
			});
			expect(result.dispatch).toBeNull();
			expect(result.event.payload).toMatchObject({
				fork: null,
				mergeRequest: {
					sourceProjectId: merge_request?.source_project_id ? "7" : null,
					targetProjectId: null,
				},
			});
		}
	});

	test("MR notes retain note body, labels, branch, actor and checkout", () => {
		const payload = {
			object_kind: "note",
			project,
			user: { id: 12, username: "actor" },
			object_attributes: { noteable_type: "MergeRequest", note: "hello" },
			merge_request: {
				iid: 3,
				source_branch: "feature",
				...ancestry,
				labels: [{ title: "ready" }, {}],
			},
		};
		expect(dispatchEvent(payload)).toMatchObject({
			body: "hello",
			labels: ["ready"],
			ref: "feature",
			isFork: false,
		});
		expect(
			gitlabAutomationCheckoutNumber(
				"https://gitlab.example:8443/team/project.git",
				recorded(payload).event.payload,
			),
		).toBe(3);
	});

	test.each([
		{ source: "merge_request_event" },
		{ source: "external_pull_request_event" },
		{ source: "parent_pipeline" },
		{ source: "push", ref: "refs/merge-requests/3/merge" },
		{ source: "push", source_project_id: 7 },
		{ source: "push", source_project_id: null, target_project_id: null },
		{ source: "push", source_branch: "refs/merge-requests/3/merge" },
	])("associated pipeline without ancestry never dispatches %j", (attributes) => {
		const result = recorded({
			object_kind: "pipeline",
			project,
			object_attributes: { status: "success", ...attributes },
		});
		expect(result.dispatch).toBeNull();
		expect(result.event.payload).toMatchObject({
			fork: null,
			mergeRequest: expect.any(Object),
		});
	});

	test("pipelines use object_attributes.ref and embedded MR iid rather than pipeline iid", () => {
		const payload = {
			object_kind: "pipeline",
			project,
			ref: "refs/heads/wrong",
			object_attributes: {
				iid: 99,
				status: "success",
				source: "merge_request_event",
				ref: "refs/heads/feature",
			},
			merge_request: { iid: 3, source_branch: "wrong", ...ancestry },
		};
		expect(dispatchEvent(payload)).toMatchObject({
			ref: "feature",
			mergeRequest: { sourceProjectId: "7", targetProjectId: "7" },
		});
		expect(
			gitlabAutomationCheckoutNumber(
				"https://gitlab.example:8443/team/project.git",
				recorded(payload).event.payload,
			),
		).toBe(3);
	});

	test("conflicting duplicate MR ancestry cannot hide behind fallback precedence", () => {
		const result = recorded({
			...mr(),
			merge_request: { ...ancestry, source_project_id: 8 },
		});
		expect(result.dispatch).toBeNull();
	});

	test("conflicting duplicate MR numbers cannot select an unrelated checkout", () => {
		const result = recorded({
			...mr(),
			merge_request: { iid: 4, ...ancestry },
		});
		expect(
			gitlabAutomationCheckoutNumber(
				"https://gitlab.example:8443/team/project.git",
				result.event.payload,
			),
		).toBeNull();
	});

	test("pipeline without explicit ordinary source stays nondispatch", () => {
		for (const source of [undefined, "unknown", "new_unsupported_source"]) {
			expect(
				recorded({
					object_kind: "pipeline",
					project,
					object_attributes: { status: "success", source },
				}).dispatch,
			).toBeNull();
		}
	});

	test("defensively validates direct callers and accepts the largest safe ID", () => {
		const params = {
			organizationId: "organization",
			connectionId: "connection",
			config,
			deliveryId: "delivery",
			payload: mr(),
		};
		expect(
			normalizeGitlabDelivery({
				...params,
				config: { ...config, host: "http://gitlab.example" },
			}),
		).toEqual({ skip: "Invalid GitLab connection configuration" });
		expect(
			normalizeGitlabDelivery({
				...params,
				payload: mr({ source_project_id: Number.MAX_SAFE_INTEGER + 1 }),
			}),
		).toEqual({ skip: "Invalid GitLab delivery payload" });
		expect(
			gitlabDeliverySchema.safeParse(mr({ iid: Number.MAX_SAFE_INTEGER }))
				.success,
		).toBe(true);
	});

	test("rejects unsafe numeric IDs everywhere before normalization", () => {
		for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "7"]) {
			for (const payload of [
				{ ...mr(), project: { ...project, id } },
				mr({ source_project_id: id }),
				mr({ target_project_id: id }),
				mr({ iid: id }),
				{ ...mr(), user: { id } },
				{ ...mr(), merge_request: { iid: id } },
			])
				expect(gitlabDeliverySchema.safeParse(payload).success).toBe(false);
		}
	});

	test("missing project identity and conflicting redundant project IDs never dispatch", () => {
		for (const payload of [
			{ object_kind: "push" },
			{ object_kind: "push", project: { ...project, id: undefined } },
			{
				object_kind: "push",
				project: { ...project, path_with_namespace: undefined },
			},
			{ object_kind: "push", project, project_id: 8 },
			{
				object_kind: "pipeline",
				project,
				object_attributes: { project_id: 8, source: "push", status: "success" },
			},
		])
			expect(normalize(payload)).toHaveProperty("skip");
	});

	test("binds project path and ID to selected project scope", () => {
		for (const path_with_namespace of [
			"team/project-other",
			"Team/project",
			"team/project/child",
			"team/../project",
			"team/%70roject",
			"team\\project",
		]) {
			expect(
				normalize({
					object_kind: "push",
					project: { ...project, path_with_namespace, web_url: undefined },
				}),
			).toEqual({ skip: "GitLab project outside connection scope" });
		}
		expect(
			normalize({ object_kind: "push", project: { ...project, id: 8 } }),
		).toEqual({ skip: "GitLab project outside connection scope" });
	});

	test("group scope uses exact namespace boundary without comparing group ID to project ID", () => {
		const group: GitLabConfig = {
			...config,
			groupPath: "team",
			scopeKind: "group",
			scopeId: "99",
		};
		expect(
			recorded({ object_kind: "push", project }, group).dispatch,
		).not.toBeNull();
		for (const path_with_namespace of ["team-other/project", "Team/project"]) {
			expect(
				normalize(
					{ object_kind: "push", project: { ...project, path_with_namespace } },
					group,
				),
			).toEqual({ skip: "GitLab project outside connection scope" });
		}
	});

	test("project display URL must agree with selected instance including port and path", () => {
		for (const web_url of [
			"https://other.example/team/project",
			"https://gitlab.example/team/project",
			"http://gitlab.example:8443/team/project",
			"https://gitlab.example:8443/team/Project",
			"https://gitlab.example:8443/team/project-other",
			"https://user:pass@gitlab.example:8443/team/project",
		]) {
			expect(
				normalize({ object_kind: "push", project: { ...project, web_url } }),
			).toEqual({ skip: "GitLab project does not match connection instance" });
		}
	});

	test("unsafe event URLs are replaced with a derived safe project URL", () => {
		for (const url of [
			"javascript:alert(1)",
			"https://other.example/team/project",
			"https://gitlab.example:8443/team/project-other",
			"https://gitlab.example:8443/team/project/../../other",
			"https://gitlab.example:8443/team/project/%2e%2e/other",
			"https://gitlab.example:8443/team/project/-/issues/1?token=secret",
			"https://user:pass@gitlab.example:8443/team/project",
		]) {
			expect(recorded(mr({ url })).event.url).toBe(project.web_url);
		}
		const url = `${project.web_url}/-/merge_requests/3#note_5`;
		expect(recorded(mr({ url })).event.url).toBe(url);
		expect(
			recorded({
				object_kind: "push",
				project: { ...project, web_url: undefined },
			}).event.url,
		).toBe(project.web_url);
	});
});

const officialMergeRequest = {
	object_kind: "merge_request",
	event_type: "merge_request",
	user: {
		id: 1,
		name: "Alex Garcia",
		username: "agarcia",
		avatar_url:
			"https://www.gravatar.com/avatar/1a29da0ccd099482194440fac762f5ccb4ec53227761d1859979367644a889a5?s=80&d=identicon",
		email: "agarcia@example.com",
	},
	project: {
		id: 2,
		name: "Flight Management",
		description: "Flight management application for tracking aircraft status.",
		web_url: "http://gitlab.example.com/flightjs/flight-management",
		avatar_url: null,
		git_ssh_url: "ssh://git@gitlab.example.com:flightjs/flight-management.git",
		git_http_url: "http://gitlab.example.com/flightjs/flight-management.git",
		namespace: "Flightjs",
		visibility_level: 0,
		path_with_namespace: "flightjs/flight-management",
		default_branch: "main",
		ci_config_path: null,
	},
	object_attributes: {
		author_id: 1,
		created_at: "2026-01-16T05:56:22.000Z",
		description:
			"This merge request adds input validation to the booking form.",
		draft: false,
		head_pipeline_id: null,
		id: 93,
		iid: 16,
		last_edited_at: null,
		last_edited_by_id: null,
		merge_commit_sha: null,
		merged_at: null,
		merge_error: null,
		merge_params: {
			force_remove_source_branch: "1",
		},
		merge_status: "checking",
		merge_user_id: null,
		merge_when_pipeline_succeeds: false,
		milestone_id: 8,
		source_branch: "feature/booking-validation",
		source_project_id: 2,
		squash_commit_sha: null,
		state_id: 1,
		target_branch: "main",
		target_branch_protected: true,
		target_project_id: 2,
		time_estimate: 0,
		title: "Add input validation to booking form",
		updated_at: "2026-01-16T05:56:25.000Z",
		updated_by_id: null,
		prepared_at: "2026-01-16T05:56:25.000Z",
		assignee_ids: [1],
		blocking_discussions_resolved: true,
		detailed_merge_status: "checking",
		first_contribution: true,
		human_time_change: null,
		human_time_estimate: null,
		human_total_time_spent: null,
		labels: [
			{
				id: 19,
				title: "enhancement",
				color: "#adb21a",
				project_id: null,
				created_at: "2026-01-07T00:03:52.000Z",
				updated_at: "2026-01-07T00:03:52.000Z",
				template: false,
				description: null,
				type: "GroupLabel",
				group_id: 24,
			},
		],
		last_commit: {
			id: "e59094b8de0f2f91abbe4760a52d9137260252d8",
			message: "Add email format validation",
			title: "Add email format validation",
			timestamp: "2026-01-16T05:01:10+00:00",
			url: "http://gitlab.example.com/flightjs/flight-management/-/commit/e59094b8de0f2f91abbe4760a52d9137260252d8",
			author: {
				name: "Alex Garcia",
				email: "agarcia@example.com",
			},
		},
		reviewer_ids: [25],
		source: {
			id: 2,
			name: "Flight Management",
			description:
				"Flight management application for tracking aircraft status.",
			web_url: "http://gitlab.example.com/flightjs/flight-management",
			avatar_url: null,
			git_ssh_url:
				"ssh://git@gitlab.example.com:flightjs/flight-management.git",
			git_http_url: "http://gitlab.example.com/flightjs/flight-management.git",
			namespace: "Flightjs",
			visibility_level: 0,
			path_with_namespace: "flightjs/flight-management",
			default_branch: "main",
			ci_config_path: null,
		},
		state: "opened",
		system: false,
		target: {
			id: 2,
			name: "Flight Management",
			description:
				"Flight management application for tracking aircraft status.",
			web_url: "http://gitlab.example.com/flightjs/flight-management",
			avatar_url: null,
			git_ssh_url:
				"ssh://git@gitlab.example.com:flightjs/flight-management.git",
			git_http_url: "http://gitlab.example.com/flightjs/flight-management.git",
			namespace: "Flightjs",
			visibility_level: 0,
			path_with_namespace: "flightjs/flight-management",
			default_branch: "main",
			ci_config_path: null,
		},
		time_change: 0,
		total_time_spent: 0,
		url: "http://gitlab.example.com/flightjs/flight-management/-/merge_requests/16",
		approval_rules: [
			{
				id: 4,
				approvals_required: 0,
				name: "All Members",
				rule_type: "any_approver",
				report_type: null,
				merge_request_id: 93,
				section: null,
				modified_from_project_rule: false,
				orchestration_policy_idx: null,
				vulnerabilities_allowed: 0,
				scanners: [],
				severity_levels: [],
				vulnerability_states: ["new_needs_triage", "new_dismissed"],
				security_orchestration_policy_configuration_id: null,
				scan_result_policy_id: null,
				applicable_post_merge: null,
				project_id: 2,
				approval_policy_rule_id: null,
				updated_at: "2026-01-16T05:56:22.000Z",
				created_at: "2026-01-16T05:56:22.000Z",
			},
		],
		action: "open",
		actioned_at: "2026-01-16T05:56:26.000Z",
	},
	labels: [
		{
			id: 19,
			title: "enhancement",
			color: "#adb21a",
			project_id: null,
			created_at: "2026-01-07T00:03:52.000Z",
			updated_at: "2026-01-07T00:03:52.000Z",
			template: false,
			description: null,
			type: "GroupLabel",
			group_id: 24,
		},
	],
	changes: {
		merge_status: {
			previous: "preparing",
			current: "checking",
		},
		updated_at: {
			previous: "2026-01-16T05:56:22.000Z",
			current: "2026-01-16T05:56:25.000Z",
		},
		prepared_at: {
			previous: null,
			current: "2026-01-16T05:56:25.000Z",
		},
	},
	assignees: [
		{
			id: 1,
			name: "Alex Garcia",
			username: "agarcia",
			avatar_url:
				"https://www.gravatar.com/avatar/1a29da0ccd099482194440fac762f5ccb4ec53227761d1859979367644a889a5?s=80&d=identicon",
			email: "[REDACTED]",
		},
	],
	reviewers: [
		{
			id: 25,
			name: "Sidney Jones",
			username: "sjones",
			avatar_url:
				"https://www.gravatar.com/avatar/1be419860e7f852e20ca2691e6b55949f7809177e7765181da42e4448491e367?s=80&d=identicon",
			email: "[REDACTED]",
			state: "unreviewed",
			re_requested: false,
		},
	],
};

describe("retained GitLab mappings", () => {
	test.each([
		[{ action: "open" }, ["merge_request.opened"]],
		[{ action: "open", draft: true }, ["merge_request.draft_opened"]],
		[{ action: "approval" }, ["merge_request.approved"]],
		[{ action: "approved" }, ["merge_request.approved"]],
		[{ action: "unapproval" }, ["merge_request.unapproved"]],
		[{ action: "unapproved" }, ["merge_request.unapproved"]],
		[{ action: "merge" }, ["merge_request.merged"]],
		[{ action: "update", state: "merged" }, ["merge_request.merged"]],
		[{ action: "update", oldrev: "commit" }, ["merge_request.pushed"]],
	] as const)("MR mapping %j", (attributes, names) => {
		expect(dispatchEvent(mr(attributes)).names).toEqual(names);
	});
	test("retains combined label and commit mapping with label precedence", () => {
		const payload = {
			...mr({
				action: "update",
				oldrev: "commit",
				labels: [{ title: "attribute" }],
			}),
			changes: { labels: {} },
			labels: [{ title: "top" }],
			merge_request: { ...ancestry, labels: [{ title: "embedded" }] },
		};
		expect(dispatchEvent(payload)).toMatchObject({
			names: ["merge_request.label_change", "merge_request.pushed"],
			labels: ["top"],
		});
	});
	test("retains attribute labels and all branch fallback sources", () => {
		expect(
			dispatchEvent(mr({ labels: [{ title: "attribute" }] })).labels,
		).toEqual(["attribute"]);
		for (const payload of [
			{
				object_kind: "pipeline",
				project,
				object_attributes: {
					source: "push",
					status: "success",
					source_branch: "refs/heads/feature",
				},
			},
			{
				object_kind: "pipeline",
				project,
				object_attributes: { source: "push", status: "success" },
				merge_request: { ...ancestry, source_branch: "refs/heads/feature" },
			},
			{
				object_kind: "pipeline",
				project,
				object_attributes: { source: "push", status: "success" },
				ref: "refs/heads/feature",
			},
		])
			expect(dispatchEvent(payload).ref).toBe("feature");
	});
	test.each(["success", "failed", "canceled"])("pipeline.%s", (status) => {
		expect(
			dispatchEvent({
				object_kind: "pipeline",
				project,
				object_attributes: { status, source: "push" },
			}).names,
		).toEqual([`pipeline.${status}`]);
	});
	test("push, issue and non-MR notes retain mappings without fabricated checkout", () => {
		for (const [object_kind, object_attributes, name] of [
			["push", {}, "push"],
			["issue", { action: "open" }, "issue.opened"],
			["note", { noteable_type: "Issue", note: "body" }, "note.added"],
		] as const) {
			const payload = {
				object_kind,
				project,
				object_attributes,
				ref: "refs/heads/main",
			};
			expect(dispatchEvent(payload)).toMatchObject({
				names: [name],
				ref: "main",
				isFork: false,
				mergeRequest: null,
			});
			expect(
				gitlabAutomationCheckoutNumber(
					"https://gitlab.example:8443/team/project.git",
					recorded(payload).event.payload,
				),
			).toBeNull();
		}
	});
	test("retains push actors from GitLab's top-level user fields", () => {
		expect(
			dispatchEvent({
				object_kind: "push",
				project,
				user_id: 12,
				user_username: "actor",
			}),
		).toMatchObject({ actorId: "12", actorLogin: "actor" });
	});
	test("unknown actions and kinds record without inventing trigger events", () => {
		for (const payload of [
			mr({ action: "close" }),
			mr({ action: "update", oldrev: null }),
			{
				object_kind: "pipeline",
				project,
				object_attributes: { status: "running", source: "push" },
			},
			{
				object_kind: "issue",
				project,
				object_attributes: { action: "update" },
			},
			{ object_kind: "tag_push", project },
		]) {
			expect(recorded(payload).dispatch).toBeNull();
		}
	});
});
