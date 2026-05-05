import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";

const getCurrentTxidMock = mock(async () => "txid-123");

const uploadImageMock = mock(async () => "https://blob.example/new-icon.png");
const generateImagePathnameMock = mock(
	({ prefix, mimeType }: { prefix: string; mimeType: string }) =>
		`${prefix}/abc.${mimeType.split("/")[1]}`,
);
const fetchAndStoreGitHubAvatarMock = mock(
	async () => "https://blob.example/avatar.png",
);
const delMock = mock(async () => undefined);

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));
const verifyOrgAdminMock = mock(async () => ({
	membership: { role: "owner" },
}));
const verifyOrgMembershipWithSubscriptionMock = mock(async () => ({
	membership: { role: "member" },
	subscription: null,
}));

const parseGitHubRemoteMock = mock((url: string) => {
	if (url.startsWith("not-a-url")) return null;
	return {
		url: "https://github.com/acme/repo.git",
		owner: "acme",
		name: "repo",
	};
});

let v2ProjectsFindResults: unknown[] = [];
let githubReposFindResults: unknown[] = [];
let membersFindManyResults: unknown[] = [];
let dbInsertReturningResults: unknown[][] = [];
let dbUpdateReturningResults: unknown[][] = [];
let txUpdateReturningResults: unknown[][] = [];

const v2ProjectsFindFirst = mock(
	async () => v2ProjectsFindResults.shift() ?? null,
);
const githubReposFindFirst = mock(
	async () => githubReposFindResults.shift() ?? null,
);
const membersFindMany = mock(async () => membersFindManyResults.shift() ?? []);

const dbInsertReturning = mock(
	async () => dbInsertReturningResults.shift() ?? [],
);
const dbInsertValues = mock(() => ({ returning: dbInsertReturning }));
const dbInsert = mock(() => ({ values: dbInsertValues }));

const dbUpdateReturning = mock(
	async () => dbUpdateReturningResults.shift() ?? [],
);
const dbUpdateWhere = mock(() => ({ returning: dbUpdateReturning }));
const dbUpdateSet = mock(() => ({ where: dbUpdateWhere }));
const dbUpdate = mock(() => ({ set: dbUpdateSet }));

const dbDeleteWhere = mock(async () => undefined);
const dbDelete = mock(() => ({ where: dbDeleteWhere }));

const txUpdateReturning = mock(
	async () => txUpdateReturningResults.shift() ?? [],
);
const txUpdateWhere = mock(() => ({ returning: txUpdateReturning }));
const txUpdateSet = mock(() => ({ where: txUpdateWhere }));
const txUpdate = mock(() => ({ set: txUpdateSet }));
const tx = { update: txUpdate };

const transactionMock = mock(async (cb: (tx: unknown) => unknown) => cb(tx));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findFirst: mock(async () => null),
				findMany: membersFindMany,
			},
		},
	},
	dbWs: {
		query: {
			v2Projects: { findFirst: v2ProjectsFindFirst },
			githubRepositories: { findFirst: githubReposFindFirst },
		},
		insert: dbInsert,
		update: dbUpdate,
		delete: dbDelete,
		transaction: transactionMock,
		select: mock(() => ({})),
	},
}));

mock.module("@superset/db/schema", () => ({
	v2Projects: {
		id: "v2_projects.id",
		organizationId: "v2_projects.organization_id",
		name: "v2_projects.name",
		slug: "v2_projects.slug",
		repoCloneUrl: "v2_projects.repo_clone_url",
		githubRepositoryId: "v2_projects.github_repository_id",
		iconUrl: "v2_projects.icon_url",
	},
	githubRepositories: {
		id: "github_repositories.id",
		organizationId: "github_repositories.organization_id",
		fullName: "github_repositories.full_name",
	},
	organizations: {
		id: "organizations.id",
		name: "organizations.name",
	},
	members: {
		userId: "members.user_id",
		organizationId: "members.organization_id",
	},
	subscriptions: {
		referenceId: "subscriptions.reference_id",
	},
	taskStatuses: {
		id: "task_statuses.id",
		organizationId: "task_statuses.organization_id",
	},
	tasks: {
		assigneeId: "tasks.assignee_id",
		createdAt: "tasks.created_at",
		creatorId: "tasks.creator_id",
		deletedAt: "tasks.deleted_at",
		externalId: "tasks.external_id",
		externalProvider: "tasks.external_provider",
		id: "tasks.id",
		organizationId: "tasks.organization_id",
		slug: "tasks.slug",
	},
	users: {
		id: "users.id",
		image: "users.image",
		name: "users.name",
	},
}));

mock.module("@superset/db/utils", () => ({
	getCurrentTxid: getCurrentTxidMock,
}));

mock.module("@superset/shared/github-remote", () => ({
	parseGitHubRemote: parseGitHubRemoteMock,
}));

mock.module("@vercel/blob", () => ({
	del: delMock,
	put: mock(),
}));

mock.module("../../lib/github-avatar", () => ({
	fetchAndStoreGitHubAvatar: fetchAndStoreGitHubAvatarMock,
}));

mock.module("../../lib/upload", () => ({
	generateImagePathname: generateImagePathnameMock,
	uploadImage: uploadImageMock,
}));

mock.module("../integration/utils", () => ({
	verifyOrgAdmin: verifyOrgAdminMock,
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: verifyOrgMembershipWithSubscriptionMock,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	desc: (value: unknown) => ({ type: "desc", value }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	ilike: (left: unknown, right: unknown) => ({ type: "ilike", left, right }),
	isNull: (value: unknown) => ({ type: "isNull", value }),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			type: "sql",
			strings,
			values,
		}),
		{ raw: (s: string) => ({ type: "raw", s }) },
	),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { v2ProjectRouter } = await import("./v2-project");

const createCaller = createCallerFactory(
	createTRPCRouter({
		v2Project: v2ProjectRouter,
	} satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const REPO_ID = "55555555-5555-4555-8555-555555555555";

function authedContext(
	overrides: { activeOrganizationId?: string | null } = {},
) {
	const activeOrganizationId =
		overrides.activeOrganizationId === undefined
			? ORG_ID
			: overrides.activeOrganizationId;
	return {
		session: {
			user: { id: USER_ID, email: "u@example.com" },
			session: { activeOrganizationId },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

function unauthedContext() {
	return {
		session: null as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

// Lets fire-and-forget background work (the icon auto-hydration in
// create / linkRepoCloneUrl) settle so we can assert on its side effects.
async function flushMicrotasks() {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
}

function setMembershipForJwt(organizationId = ORG_ID) {
	membersFindManyResults.push([{ organizationId }]);
}

beforeEach(() => {
	v2ProjectsFindResults = [];
	githubReposFindResults = [];
	membersFindManyResults = [];
	dbInsertReturningResults = [];
	dbUpdateReturningResults = [];
	txUpdateReturningResults = [];

	v2ProjectsFindFirst.mockClear();
	githubReposFindFirst.mockClear();
	membersFindMany.mockClear();
	dbInsert.mockClear();
	dbInsertValues.mockClear();
	dbInsertReturning.mockClear();
	dbUpdate.mockClear();
	dbUpdateSet.mockClear();
	dbUpdateWhere.mockClear();
	dbUpdateReturning.mockClear();
	dbDelete.mockClear();
	dbDeleteWhere.mockClear();
	txUpdate.mockClear();
	txUpdateSet.mockClear();
	txUpdateWhere.mockClear();
	txUpdateReturning.mockClear();
	transactionMock.mockClear();

	getCurrentTxidMock.mockReset();
	getCurrentTxidMock.mockImplementation(async () => "txid-123");

	uploadImageMock.mockReset();
	uploadImageMock.mockImplementation(
		async () => "https://blob.example/new-icon.png",
	);
	generateImagePathnameMock.mockClear();
	fetchAndStoreGitHubAvatarMock.mockReset();
	fetchAndStoreGitHubAvatarMock.mockImplementation(
		async () => "https://blob.example/avatar.png",
	);
	delMock.mockReset();
	delMock.mockImplementation(async () => undefined);

	verifyOrgMembershipMock.mockReset();
	verifyOrgMembershipMock.mockImplementation(async () => ({
		membership: { role: "member" },
	}));
	verifyOrgAdminMock.mockReset();
	verifyOrgAdminMock.mockImplementation(async () => ({
		membership: { role: "owner" },
	}));

	parseGitHubRemoteMock.mockClear();
	parseGitHubRemoteMock.mockImplementation((url: string) => {
		if (url.startsWith("not-a-url")) return null;
		return {
			url: "https://github.com/acme/repo.git",
			owner: "acme",
			name: "repo",
		};
	});
});

describe("v2Project.uploadIcon", () => {
	const validInput = {
		id: PROJECT_ID,
		fileData: "data:image/png;base64,iVBORw0KGgo=",
		fileName: "icon.png",
		mimeType: "image/png",
	};

	it("rejects unauthenticated callers before any DB read", async () => {
		const caller = createCaller(unauthedContext());

		await expect(caller.v2Project.uploadIcon(validInput)).rejects.toMatchObject(
			{ code: "UNAUTHORIZED" },
		);
		expect(v2ProjectsFindFirst).not.toHaveBeenCalled();
		expect(uploadImageMock).not.toHaveBeenCalled();
	});

	it("rejects when the session has no active organization", async () => {
		const caller = createCaller(authedContext({ activeOrganizationId: null }));

		await expect(caller.v2Project.uploadIcon(validInput)).rejects.toMatchObject(
			{ code: "FORBIDDEN", message: "No active organization" },
		);
		expect(v2ProjectsFindFirst).not.toHaveBeenCalled();
		expect(uploadImageMock).not.toHaveBeenCalled();
	});

	it("rejects with NOT_FOUND when the project does not exist", async () => {
		v2ProjectsFindResults.push(null);
		const caller = createCaller(authedContext());

		await expect(caller.v2Project.uploadIcon(validInput)).rejects.toMatchObject(
			{ code: "NOT_FOUND", message: "Project not found" },
		);
		expect(uploadImageMock).not.toHaveBeenCalled();
	});

	it("rejects with NOT_FOUND when the project belongs to another organization", async () => {
		v2ProjectsFindResults.push({
			id: PROJECT_ID,
			organizationId: OTHER_ORG_ID,
		});
		const caller = createCaller(authedContext());

		await expect(caller.v2Project.uploadIcon(validInput)).rejects.toMatchObject(
			{ code: "NOT_FOUND" },
		);
		expect(verifyOrgMembershipMock).not.toHaveBeenCalled();
		expect(uploadImageMock).not.toHaveBeenCalled();
	});

	it("rejects when the user is not a member of the project's organization", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		});
		const caller = createCaller(authedContext());

		await expect(caller.v2Project.uploadIcon(validInput)).rejects.toMatchObject(
			{ code: "FORBIDDEN" },
		);
		expect(uploadImageMock).not.toHaveBeenCalled();
	});

	it("uploads with no existingUrl when the project has no icon yet", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({ iconUrl: null });
		txUpdateReturningResults.push([
			{ id: PROJECT_ID, iconUrl: "https://blob.example/new-icon.png" },
		]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.uploadIcon(validInput);

		expect(uploadImageMock).toHaveBeenCalledWith({
			fileData: validInput.fileData,
			mimeType: "image/png",
			pathname: `organizations/${ORG_ID}/projects/${PROJECT_ID}/icon/abc.png`,
			existingUrl: null,
		});
		expect(generateImagePathnameMock).toHaveBeenCalledWith({
			prefix: `organizations/${ORG_ID}/projects/${PROJECT_ID}/icon`,
			mimeType: "image/png",
		});
		expect(txUpdateSet).toHaveBeenCalledWith({
			iconUrl: "https://blob.example/new-icon.png",
		});
		expect(result).toMatchObject({
			id: PROJECT_ID,
			iconUrl: "https://blob.example/new-icon.png",
			txid: "txid-123",
		});
	});

	it("forwards the existing iconUrl so uploadImage can clean up the prior blob", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({
			iconUrl: "https://blob.example/old-icon.png",
		});
		txUpdateReturningResults.push([
			{ id: PROJECT_ID, iconUrl: "https://blob.example/new-icon.png" },
		]);

		const caller = createCaller(authedContext());
		await caller.v2Project.uploadIcon(validInput);

		expect(uploadImageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				existingUrl: "https://blob.example/old-icon.png",
			}),
		);
	});

	it("returns NOT_FOUND when the post-upload UPDATE finds no row (race: project deleted)", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({ iconUrl: null });
		txUpdateReturningResults.push([]);

		const caller = createCaller(authedContext());

		await expect(caller.v2Project.uploadIcon(validInput)).rejects.toMatchObject(
			{ code: "NOT_FOUND", message: "Project not found" },
		);
	});
});

describe("v2Project.resetIconToGitHub", () => {
	it("runs auth before any side effect (covered in depth on uploadIcon)", async () => {
		const caller = createCaller(unauthedContext());

		await expect(
			caller.v2Project.resetIconToGitHub({ id: PROJECT_ID }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(v2ProjectsFindFirst).not.toHaveBeenCalled();
		expect(fetchAndStoreGitHubAvatarMock).not.toHaveBeenCalled();
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("rejects with BAD_REQUEST when the project has no linked repository", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({ iconUrl: null, repoCloneUrl: null });
		const caller = createCaller(authedContext());

		await expect(
			caller.v2Project.resetIconToGitHub({ id: PROJECT_ID }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Project has no linked GitHub repository",
		});
		expect(fetchAndStoreGitHubAvatarMock).not.toHaveBeenCalled();
	});

	it("rejects with BAD_GATEWAY when GitHub avatar fetch fails", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({
			iconUrl: null,
			repoCloneUrl: "https://github.com/acme/repo.git",
		});
		fetchAndStoreGitHubAvatarMock.mockImplementationOnce(async () => null);

		const caller = createCaller(authedContext());

		await expect(
			caller.v2Project.resetIconToGitHub({ id: PROJECT_ID }),
		).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			message: "Could not fetch GitHub avatar",
		});
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("forwards the existing iconUrl to fetchAndStoreGitHubAvatar so it can replace the prior blob", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({
			iconUrl: "https://blob.example/old-icon.png",
			repoCloneUrl: "https://github.com/acme/repo.git",
		});
		txUpdateReturningResults.push([
			{ id: PROJECT_ID, iconUrl: "https://blob.example/avatar.png" },
		]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.resetIconToGitHub({
			id: PROJECT_ID,
		});

		expect(fetchAndStoreGitHubAvatarMock).toHaveBeenCalledWith({
			owner: "acme",
			pathnamePrefix: `organizations/${ORG_ID}/projects/${PROJECT_ID}/icon`,
			existingUrl: "https://blob.example/old-icon.png",
		});
		expect(result).toMatchObject({
			id: PROJECT_ID,
			iconUrl: "https://blob.example/avatar.png",
			txid: "txid-123",
		});
	});

	it("returns NOT_FOUND when the post-fetch UPDATE finds no row", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({
			iconUrl: null,
			repoCloneUrl: "https://github.com/acme/repo.git",
		});
		txUpdateReturningResults.push([]);

		const caller = createCaller(authedContext());

		await expect(
			caller.v2Project.resetIconToGitHub({ id: PROJECT_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("v2Project.delete", () => {
	const input = {
		organizationId: ORG_ID,
		id: PROJECT_ID,
	};

	it("rejects unauthenticated callers", async () => {
		const caller = createCaller(unauthedContext());

		await expect(caller.v2Project.delete(input)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("rejects when the caller is not a member of the organization", async () => {
		setMembershipForJwt(OTHER_ORG_ID);
		const caller = createCaller(authedContext());

		await expect(caller.v2Project.delete(input)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(dbDelete).not.toHaveBeenCalled();
		expect(delMock).not.toHaveBeenCalled();
	});

	it("is idempotent when the project is missing or scoped to another organization", async () => {
		setMembershipForJwt();
		v2ProjectsFindResults.push({
			id: PROJECT_ID,
			organizationId: OTHER_ORG_ID,
			iconUrl: "https://blob.example/other-org-icon.png",
		});
		const caller = createCaller(authedContext());

		await expect(caller.v2Project.delete(input)).resolves.toEqual({
			success: true,
		});
		expect(dbDelete).not.toHaveBeenCalled();
		expect(delMock).not.toHaveBeenCalled();
	});

	it("deletes the project row without blob cleanup when there is no icon", async () => {
		setMembershipForJwt();
		v2ProjectsFindResults.push({
			id: PROJECT_ID,
			organizationId: ORG_ID,
			iconUrl: null,
		});
		const caller = createCaller(authedContext());

		await expect(caller.v2Project.delete(input)).resolves.toEqual({
			success: true,
		});
		expect(dbDeleteWhere).toHaveBeenCalled();
		expect(delMock).not.toHaveBeenCalled();
	});

	it("deletes the project icon blob after deleting the project row", async () => {
		setMembershipForJwt();
		v2ProjectsFindResults.push({
			id: PROJECT_ID,
			organizationId: ORG_ID,
			iconUrl: "https://blob.example/project-icon.png",
		});
		const caller = createCaller(authedContext());

		await expect(caller.v2Project.delete(input)).resolves.toEqual({
			success: true,
		});
		expect(dbDeleteWhere).toHaveBeenCalled();
		expect(delMock).toHaveBeenCalledWith(
			"https://blob.example/project-icon.png",
		);
	});

	it("swallows project icon blob cleanup failures", async () => {
		setMembershipForJwt();
		v2ProjectsFindResults.push({
			id: PROJECT_ID,
			organizationId: ORG_ID,
			iconUrl: "https://blob.example/project-icon.png",
		});
		delMock.mockImplementationOnce(async () => {
			throw new Error("blob storage unavailable");
		});
		const consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
		const caller = createCaller(authedContext());

		await expect(caller.v2Project.delete(input)).resolves.toEqual({
			success: true,
		});
		expect(consoleWarnSpy).toHaveBeenCalled();

		consoleWarnSpy.mockRestore();
	});
});

describe("v2Project.removeIcon", () => {
	it("runs auth before any side effect (covered in depth on uploadIcon)", async () => {
		const caller = createCaller(unauthedContext());

		await expect(
			caller.v2Project.removeIcon({ id: PROJECT_ID }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(v2ProjectsFindFirst).not.toHaveBeenCalled();
		expect(delMock).not.toHaveBeenCalled();
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("does not call blob.del when the project has no icon", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({ iconUrl: null });
		txUpdateReturningResults.push([{ id: PROJECT_ID, iconUrl: null }]);

		const caller = createCaller(authedContext());
		await caller.v2Project.removeIcon({ id: PROJECT_ID });

		expect(delMock).not.toHaveBeenCalled();
		expect(txUpdateSet).toHaveBeenCalledWith({ iconUrl: null });
	});

	it("deletes the existing blob and clears iconUrl", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({
			iconUrl: "https://blob.example/old-icon.png",
		});
		txUpdateReturningResults.push([{ id: PROJECT_ID, iconUrl: null }]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.removeIcon({ id: PROJECT_ID });

		expect(delMock).toHaveBeenCalledWith("https://blob.example/old-icon.png");
		expect(txUpdateSet).toHaveBeenCalledWith({ iconUrl: null });
		expect(result).toMatchObject({
			id: PROJECT_ID,
			iconUrl: null,
			txid: "txid-123",
		});
	});

	it("swallows blob.del failures and still clears iconUrl in DB", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({
			iconUrl: "https://blob.example/old-icon.png",
		});
		txUpdateReturningResults.push([{ id: PROJECT_ID, iconUrl: null }]);
		delMock.mockImplementationOnce(async () => {
			throw new Error("blob storage unavailable");
		});
		const consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.removeIcon({ id: PROJECT_ID });

		expect(consoleWarnSpy).toHaveBeenCalled();
		expect(txUpdateSet).toHaveBeenCalledWith({ iconUrl: null });
		expect(result).toMatchObject({ id: PROJECT_ID, iconUrl: null });

		consoleWarnSpy.mockRestore();
	});

	it("returns NOT_FOUND when the post-delete UPDATE finds no row", async () => {
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		v2ProjectsFindResults.push({
			iconUrl: "https://blob.example/old-icon.png",
		});
		txUpdateReturningResults.push([]);

		const caller = createCaller(authedContext());

		await expect(
			caller.v2Project.removeIcon({ id: PROJECT_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("v2Project.create — GitHub avatar auto-hydration", () => {
	const baseInput = {
		organizationId: ORG_ID,
		name: "Acme",
		slug: "acme",
	};

	function setMembershipForCreate() {
		membersFindManyResults.push([{ organizationId: ORG_ID }]);
	}

	it("does not call avatar fetch when no repoCloneUrl is supplied", async () => {
		setMembershipForCreate();
		dbInsertReturningResults.push([
			{ id: PROJECT_ID, organizationId: ORG_ID, iconUrl: null },
		]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.create(baseInput);

		expect(fetchAndStoreGitHubAvatarMock).not.toHaveBeenCalled();
		expect(result).toMatchObject({ id: PROJECT_ID });
	});

	it("rejects with BAD_REQUEST when repoCloneUrl is unparseable, before insert", async () => {
		setMembershipForCreate();

		const caller = createCaller(authedContext());

		await expect(
			caller.v2Project.create({
				...baseInput,
				repoCloneUrl: "not-a-url://oops",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Could not parse GitHub remote URL",
		});
		expect(dbInsert).not.toHaveBeenCalled();
		expect(fetchAndStoreGitHubAvatarMock).not.toHaveBeenCalled();
	});

	it("rejects when caller is not a member of the target organization", async () => {
		membersFindManyResults.push([{ organizationId: OTHER_ORG_ID }]);

		const caller = createCaller(authedContext());

		await expect(caller.v2Project.create(baseInput)).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
		expect(dbInsert).not.toHaveBeenCalled();
	});

	it("returns the inserted project immediately and kicks off background avatar hydration", async () => {
		setMembershipForCreate();
		githubReposFindResults.push(null);
		dbInsertReturningResults.push([
			{ id: PROJECT_ID, organizationId: ORG_ID, iconUrl: null },
		]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.create({
			...baseInput,
			repoCloneUrl: "https://github.com/acme/repo.git",
		});

		// The mutation must not block on the GitHub fetch — it returns the
		// inserted row immediately with iconUrl: null. Electric will sync the
		// icon to the client once the background hydration lands.
		expect(result).toMatchObject({ id: PROJECT_ID, iconUrl: null });

		await flushMicrotasks();

		expect(fetchAndStoreGitHubAvatarMock).toHaveBeenCalledWith({
			owner: "acme",
			pathnamePrefix: `organizations/${ORG_ID}/projects/${PROJECT_ID}/icon`,
			existingUrl: null,
		});
		// Background UPDATE writes the iconUrl with the same race guard as the
		// link path so a parallel custom upload isn't clobbered.
		expect(dbUpdate).toHaveBeenCalledTimes(1);
	});

	it("does not write iconUrl in the background when GitHub avatar fetch returns null", async () => {
		setMembershipForCreate();
		githubReposFindResults.push(null);
		dbInsertReturningResults.push([
			{ id: PROJECT_ID, organizationId: ORG_ID, iconUrl: null },
		]);
		fetchAndStoreGitHubAvatarMock.mockImplementationOnce(async () => null);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.create({
			...baseInput,
			repoCloneUrl: "https://github.com/acme/repo.git",
		});

		await flushMicrotasks();

		expect(fetchAndStoreGitHubAvatarMock).toHaveBeenCalledTimes(1);
		expect(dbUpdate).not.toHaveBeenCalled();
		expect(result).toMatchObject({ id: PROJECT_ID, iconUrl: null });
	});

	it("does not crash the mutation when background avatar hydration throws", async () => {
		setMembershipForCreate();
		githubReposFindResults.push(null);
		dbInsertReturningResults.push([
			{ id: PROJECT_ID, organizationId: ORG_ID, iconUrl: null },
		]);
		fetchAndStoreGitHubAvatarMock.mockImplementationOnce(async () => {
			throw new Error("connection refused");
		});
		const consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.create({
			...baseInput,
			repoCloneUrl: "https://github.com/acme/repo.git",
		});

		await flushMicrotasks();

		expect(result).toMatchObject({ id: PROJECT_ID, iconUrl: null });
		expect(consoleWarnSpy).toHaveBeenCalled();

		consoleWarnSpy.mockRestore();
	});
});

describe("v2Project.linkRepoCloneUrl — GitHub avatar auto-hydration", () => {
	const baseInput = {
		organizationId: ORG_ID,
		id: PROJECT_ID,
		repoCloneUrl: "https://github.com/acme/repo.git",
	};

	it("rejects with FORBIDDEN when caller is not a member of the org", async () => {
		membersFindManyResults.push([{ organizationId: OTHER_ORG_ID }]);

		const caller = createCaller(authedContext());

		await expect(
			caller.v2Project.linkRepoCloneUrl(baseInput),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects with BAD_REQUEST when repoCloneUrl cannot be parsed", async () => {
		setMembershipForJwt();

		const caller = createCaller(authedContext());

		await expect(
			caller.v2Project.linkRepoCloneUrl({
				...baseInput,
				repoCloneUrl: "not-a-url://oops",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Could not parse GitHub remote URL",
		});
		expect(fetchAndStoreGitHubAvatarMock).not.toHaveBeenCalled();
	});

	it("returns the linked row immediately and kicks off background avatar hydration when iconUrl was null", async () => {
		setMembershipForJwt();
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		githubReposFindResults.push({ id: REPO_ID });
		// link UPDATE result
		dbUpdateReturningResults.push([
			{ id: PROJECT_ID, organizationId: ORG_ID, iconUrl: null },
		]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.linkRepoCloneUrl(baseInput);

		// Mutation returns immediately — iconUrl will land via Electric sync.
		expect(result).toMatchObject({ id: PROJECT_ID, iconUrl: null });

		await flushMicrotasks();

		expect(fetchAndStoreGitHubAvatarMock).toHaveBeenCalledWith({
			owner: "acme",
			pathnamePrefix: `organizations/${ORG_ID}/projects/${PROJECT_ID}/icon`,
			existingUrl: null,
		});
		// Background performs a second UPDATE.
		expect(dbUpdate).toHaveBeenCalledTimes(2);
	});

	it("does not fetch the avatar when the project already has a custom icon", async () => {
		setMembershipForJwt();
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		githubReposFindResults.push({ id: REPO_ID });
		dbUpdateReturningResults.push([
			{
				id: PROJECT_ID,
				organizationId: ORG_ID,
				iconUrl: "https://blob.example/custom.png",
			},
		]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.linkRepoCloneUrl(baseInput);

		await flushMicrotasks();

		expect(fetchAndStoreGitHubAvatarMock).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			iconUrl: "https://blob.example/custom.png",
		});
	});

	it("preserves a racing custom upload — background UPDATE carries the isNull(iconUrl) race guard", async () => {
		setMembershipForJwt();
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		githubReposFindResults.push({ id: REPO_ID });
		// link UPDATE saw iconUrl null at the time it ran
		dbUpdateReturningResults.push([
			{ id: PROJECT_ID, organizationId: ORG_ID, iconUrl: null },
		]);

		const caller = createCaller(authedContext());
		const result = await caller.v2Project.linkRepoCloneUrl(baseInput);

		// Linked row returned immediately
		expect(result).toMatchObject({ id: PROJECT_ID, iconUrl: null });

		await flushMicrotasks();

		expect(fetchAndStoreGitHubAvatarMock).toHaveBeenCalledTimes(1);
		// The background UPDATE must carry the isNull(iconUrl) race guard,
		// otherwise a parallel custom upload could be silently overwritten.
		expect(dbUpdateWhere.mock.calls.length).toBe(2);
		const postFetchWhere = dbUpdateWhere.mock.calls[1]?.[0] as {
			type: string;
			conditions: Array<{ type: string; value?: unknown }>;
		};
		expect(postFetchWhere.type).toBe("and");
		expect(postFetchWhere.conditions).toContainEqual(
			expect.objectContaining({
				type: "isNull",
				value: "v2_projects.icon_url",
			}),
		);
	});

	it("rejects with CONFLICT when the project already has a linked repo (link UPDATE matched no rows)", async () => {
		setMembershipForJwt();
		v2ProjectsFindResults.push({ id: PROJECT_ID, organizationId: ORG_ID });
		githubReposFindResults.push(null);
		// link UPDATE returns no rows because WHERE isNull(repoCloneUrl) failed
		dbUpdateReturningResults.push([]);

		const caller = createCaller(authedContext());

		await expect(
			caller.v2Project.linkRepoCloneUrl(baseInput),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "Project already has a linked repository",
		});
		expect(fetchAndStoreGitHubAvatarMock).not.toHaveBeenCalled();
	});
});
