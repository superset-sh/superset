import { describe, expect, it } from "bun:test";
import type { SidebarFolderPruneResult } from "@superset/shared/sidebar-folders";
import {
	type SidebarRendererRequest,
	SidebarRequestError,
	SidebarRequests,
} from "./sidebar-requests";

const RESULT: SidebarFolderPruneResult = {
	dryRun: false,
	removed: [],
	skipped: [],
	failed: [],
};

function setup({
	orgs,
	focusedWindowId = null,
	replyTimeoutMs = 1_000,
}: {
	orgs: Record<number, string | null>;
	focusedWindowId?: number | null;
	replyTimeoutMs?: number;
}) {
	const broker = new SidebarRequests({
		orgOfWindow: (windowId) => orgs[windowId] ?? null,
		focusedWindowId: () => focusedWindowId,
		replyTimeoutMs,
	});
	const sent: SidebarRendererRequest[] = [];
	broker.on("request", (request: SidebarRendererRequest) => {
		sent.push(request);
	});
	return { broker, sent };
}

describe("SidebarRequests", () => {
	it("never hands a request to a window of another organization", async () => {
		const { broker, sent } = setup({
			orgs: { 1: "org-other", 2: "org-cli" },
			focusedWindowId: 1,
		});
		broker.addSubscriber(101, 1);
		broker.addSubscriber(102, 2);
		const reply = broker.pruneEmptyFolders({ organizationId: "org-cli" });
		expect(sent.map((request) => request.targetWebContentsId)).toEqual([102]);
		broker.respond(
			{ requestId: sent[0]?.requestId ?? "", result: RESULT },
			102,
		);
		expect(await reply).toEqual(RESULT);
	});

	it("refuses when no window shows the organization", async () => {
		const { broker, sent } = setup({
			orgs: { 1: "org-other" },
			focusedWindowId: 1,
		});
		broker.addSubscriber(101, 1);
		const error = await broker
			.pruneEmptyFolders({ organizationId: "org-cli" })
			.catch((thrown: unknown) => thrown);
		expect(error).toBeInstanceOf(SidebarRequestError);
		expect((error as SidebarRequestError).status).toBe(412);
		expect(sent).toEqual([]);
	});

	it("prefers the focused window among those of the organization", () => {
		const { broker, sent } = setup({
			orgs: { 1: "org-cli", 2: "org-cli" },
			focusedWindowId: 2,
		});
		broker.addSubscriber(101, 1);
		broker.addSubscriber(102, 2);
		void broker
			.pruneEmptyFolders({ organizationId: "org-cli" })
			.catch(() => {});
		expect(sent[0]?.targetWebContentsId).toBe(102);
	});

	it("follows a window that switched organization after subscribing", async () => {
		const orgs: Record<number, string | null> = { 1: "org-cli" };
		const { broker, sent } = setup({ orgs });
		broker.addSubscriber(101, 1);
		orgs[1] = "org-other";
		const error = await broker
			.pruneEmptyFolders({ organizationId: "org-cli" })
			.catch((thrown: unknown) => thrown);
		expect((error as SidebarRequestError).status).toBe(412);
		expect(sent).toEqual([]);
	});

	it("ignores a reply from a window it did not ask", async () => {
		const { broker, sent } = setup({
			orgs: { 1: "org-cli" },
			replyTimeoutMs: 20,
		});
		broker.addSubscriber(101, 1);
		const reply = broker.pruneEmptyFolders({ organizationId: "org-cli" });
		broker.respond(
			{ requestId: sent[0]?.requestId ?? "", result: RESULT },
			999,
		);
		const error = await reply.catch((thrown: unknown) => thrown);
		expect((error as SidebarRequestError).status).toBe(504);
	});

	it("maps a renderer refusal to its status", async () => {
		const { broker, sent } = setup({ orgs: { 1: "org-cli" } });
		broker.addSubscriber(101, 1);
		const reply = broker.pruneEmptyFolders({ organizationId: "org-cli" });
		broker.respond(
			{
				requestId: sent[0]?.requestId ?? "",
				error: { code: "PRECONDITION_FAILED", message: "switched" },
			},
			101,
		);
		const error = await reply.catch((thrown: unknown) => thrown);
		expect((error as SidebarRequestError).status).toBe(412);
		expect((error as Error).message).toBe("switched");
	});

	it("drops a window once its last subscription ends", async () => {
		const { broker } = setup({ orgs: { 1: "org-cli" } });
		broker.addSubscriber(101, 1);
		broker.addSubscriber(101, 1);
		broker.removeSubscriber(101);
		broker.removeSubscriber(101);
		const error = await broker
			.pruneEmptyFolders({ organizationId: "org-cli" })
			.catch((thrown: unknown) => thrown);
		expect((error as SidebarRequestError).status).toBe(412);
	});
});
