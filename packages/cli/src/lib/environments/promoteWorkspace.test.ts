import { describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { type ApiClient, ApiHttpError } from "../api-client";
import { promoteWorkspace } from "./promoteWorkspace";

type Row = { id: string; name: string; sourceRef: string };

/** `list` answers with each response in turn, then keeps repeating the last. */
function fakeApi({
	promote,
	listResponses,
}: {
	promote: () => Promise<Row>;
	listResponses: Row[][];
}) {
	const promoted: unknown[] = [];
	const queue = [...listResponses];
	const api = {
		environment: {
			list: {
				query: async () => (queue.length > 1 ? queue.shift() : queue[0]) ?? [],
			},
			promote: {
				mutate: async (input: unknown) => {
					promoted.push(input);
					return promote();
				},
			},
		},
	} as unknown as ApiClient;
	return { api, promoted };
}

const fast = { pollIntervalMs: 1, pollTimeoutMs: 200 };
/** What the tRPC client throws for a gateway's HTML 504: the HTTP error as its cause. */
const gatewayTimeout = () =>
	Promise.reject(
		new TRPCClientError("HTTP 504", {
			cause: new ApiHttpError(504, "Gateway Timeout", ""),
		}),
	);

describe("promoteWorkspace", () => {
	test("a gateway timeout waits for the new environment, not an older one with its name", async () => {
		const older = { id: "old", name: "Kiet", sourceRef: "env-old" };
		const { api, promoted } = fakeApi({
			promote: gatewayTimeout,
			listResponses: [
				[older],
				[older],
				[older, { id: "new", name: "Kiet", sourceRef: "env-new" }],
			],
		});
		const saved = await promoteWorkspace({
			api,
			organizationId: "org",
			workspaceId: "w",
			into: { name: "Kiet" },
			...fast,
		});
		expect(saved.id).toBe("new");
		expect(promoted).toEqual([
			{
				cloudWorkspaceId: "w",
				name: "Kiet",
				environmentId: undefined,
				scope: undefined,
			},
		]);
	});

	test("a replace waits for the environment to move to a new golden", async () => {
		const before = { id: "env", name: "Kiet", sourceRef: "env-old" };
		const { api, promoted } = fakeApi({
			promote: gatewayTimeout,
			listResponses: [[before], [{ ...before, sourceRef: "env-new" }]],
		});
		const saved = await promoteWorkspace({
			api,
			organizationId: "org",
			workspaceId: "w",
			into: { environment: before },
			...fast,
		});
		expect(saved.sourceRef).toBe("env-new");
		expect(promoted).toEqual([
			{
				cloudWorkspaceId: "w",
				name: undefined,
				environmentId: "env",
				scope: undefined,
			},
		]);
	});

	test("a refusal from the server is not retried", async () => {
		const { api } = fakeApi({
			promote: () =>
				Promise.reject(
					new Error("Only a ready workspace can become an environment"),
				),
			listResponses: [],
		});
		await expect(
			promoteWorkspace({
				api,
				organizationId: "org",
				workspaceId: "w",
				into: { name: "Kiet" },
				...fast,
			}),
		).rejects.toThrow("Only a ready workspace");
	});

	test("gives up when the row never appears", async () => {
		const { api } = fakeApi({ promote: gatewayTimeout, listResponses: [[]] });
		await expect(
			promoteWorkspace({
				api,
				organizationId: "org",
				workspaceId: "w",
				into: { name: "Kiet" },
				pollIntervalMs: 1,
				pollTimeoutMs: 20,
			}),
		).rejects.toThrow("did not finish");
	});
});
