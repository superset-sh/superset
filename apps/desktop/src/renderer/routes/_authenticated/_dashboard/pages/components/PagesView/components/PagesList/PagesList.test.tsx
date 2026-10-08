import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import type { AppRouter } from "@superset/trpc";
import type { TRPCLink } from "@trpc/client";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { TRPCClientError } = await import("@trpc/client");
const { observable } = await import("@trpc/server/observable");
const { act, cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { cloudTrpc } = await import("renderer/lib/cloud-trpc");
const { PagesList } = await import("./PagesList");

type Input = Record<string, unknown>;

interface ListPage {
	items: ReturnType<typeof page>[];
	nextCursor: string | null;
}

interface Counts {
	all: number;
	team: number;
	mine: number;
	pinned: number;
	workspaces: Array<{ workspaceId: string; count: number }>;
	authors: Array<{
		userId: string | null;
		name: string | null;
		image: string | null;
		count: number;
	}>;
}

function page(id: string) {
	return {
		id,
		title: `Page ${id}`,
		slug: `page-${id}`,
		url: `https://app.superset.sh/page/page-${id}`,
		thumbnailUrl: null,
		visibility: "org",
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
		latestVersion: 1,
		sharedVersion: null,
		createdByUserId: null,
		ownerName: null,
	};
}

const neverAnswers = () => new Promise<never>(() => {});

let listInputs: Input[] = [];
let countsInputs: Input[] = [];
let answerList: (input: Input) => ListPage | Promise<ListPage>;
let answerCounts: () => Counts | Promise<Counts>;
let counts: Counts;

const link: TRPCLink<AppRouter> = () => (call) =>
	observable((observer) => {
		const input = call.op.input as Input;
		Promise.resolve()
			.then(() => {
				if (call.op.path === "page.listPaginated") {
					listInputs.push(input);
					return answerList(input);
				}
				if (call.op.path === "page.counts") {
					countsInputs.push(input);
					return answerCounts();
				}
				throw new Error(`Unexpected call to ${call.op.path}`);
			})
			.then(
				(data) => {
					observer.next({ result: { data } });
					observer.complete();
				},
				(error) => observer.error(TRPCClientError.from(error as Error)),
			);
	});

/** Lets a test fire the sentinel without a real viewport. */
let observed: Array<() => void> = [];
class TestIntersectionObserver {
	constructor(
		private callback: (entries: Array<{ isIntersecting: boolean }>) => void,
	) {}
	observe() {
		observed.push(() => this.callback([{ isIntersecting: true }]));
	}
	disconnect() {}
}
const intersectionObserverHost = globalThis as {
	IntersectionObserver?: unknown;
};
const realIntersectionObserver = intersectionObserverHost.IntersectionObserver;
intersectionObserverHost.IntersectionObserver = TestIntersectionObserver;

const onScopeChange = mock((_scope: string) => {});
const onSearchChange = mock((_search: string) => {});
const PINS = ["pin-1", "pin-2"];

function renderList({
	scope = "all" as "all" | "pinned" | "team" | "mine",
	search = "",
	authorId = null as string | null,
	workspaceId = null as string | null,
} = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<cloudTrpc.Provider
			client={cloudTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
			<PagesList
				search={search}
				scope={scope}
				authorId={authorId}
				workspaceId={workspaceId}
				onSearchChange={onSearchChange}
				onScopeChange={onScopeChange}
				onAuthorChange={mock()}
				onWorkspaceChange={mock()}
				onOpenPage={mock()}
				currentUserId={undefined}
				favoritePageIds={PINS}
				favoritePageIdSet={new Set(PINS)}
				onTogglePin={mock()}
				workspaceNames={new Map([["ws-1", "Workspace One"]])}
				creatingWithAgent={false}
				onCreateWithAgent={mock()}
				searchDebounceMs={5}
			/>
		</cloudTrpc.Provider>,
	);
	const settled = () =>
		waitFor(() => {
			expect(listInputs.length).toBeGreaterThan(0);
			expect(queryClient.isFetching()).toBe(0);
		});
	return { view, settled };
}

async function scrollToSentinel() {
	await waitFor(() => expect(observed.length).toBeGreaterThan(0));
	const fire = observed;
	observed = [];
	await act(async () => {
		for (const intersect of fire) intersect();
	});
	await waitFor(() => expect(listInputs).toHaveLength(2));
}

const loadedPages = (view: ReturnType<typeof render>) =>
	view.queryAllByText(/^Page /);

beforeEach(() => {
	onScopeChange.mockClear();
	onSearchChange.mockClear();
	observed = [];
	listInputs = [];
	countsInputs = [];
	counts = {
		all: 1,
		team: 1,
		mine: 0,
		pinned: 2,
		workspaces: [{ workspaceId: "ws-1", count: 3 }],
		authors: [
			{ userId: "user-1", name: "Ada", image: null, count: 2 },
			{ userId: "user-2", name: "Grace", image: null, count: 1 },
		],
	};
	answerList = () => ({ items: [page("a")], nextCursor: null });
	answerCounts = () => counts;
});

afterEach(cleanup);
afterAll(async () => {
	intersectionObserverHost.IntersectionObserver = realIntersectionObserver;
});

describe("PagesList server-side filtering", () => {
	test("sends the search to the server instead of filtering what it loaded", async () => {
		await renderList({ search: "report" }).settled();
		expect(listInputs[0]).toMatchObject({ search: "report" });
	});

	test("sends the scope, the author and the workspace too", async () => {
		await renderList({
			scope: "team",
			authorId: "user-1",
			workspaceId: "ws-1",
		}).settled();
		expect(listInputs[0]).toMatchObject({
			scope: "team",
			authorId: "user-1",
			workspaceId: "ws-1",
		});
	});

	test("asks for the pinned tab by id, because pins are not a server column", async () => {
		await renderList({ scope: "pinned" }).settled();
		expect(listInputs[0]).toMatchObject({ scope: "all", ids: PINS });
	});

	test("asks for one batch, not the whole organization", async () => {
		await renderList().settled();
		expect(listInputs[0]?.limit).toBe(48);
	});
});

describe("PagesList loads on scroll", () => {
	beforeEach(() => {
		answerList = (input) =>
			input.cursor
				? { items: [page("b")], nextCursor: null }
				: { items: [page("a")], nextCursor: "after-a" };
	});

	test("does not sweep the organization on mount", async () => {
		await renderList().settled();
		expect(listInputs).toHaveLength(1);
	});

	test("fetches the next batch when the sentinel comes into view", async () => {
		const { view, settled } = renderList();
		await scrollToSentinel();
		await settled();
		expect(listInputs[1]).toMatchObject({ cursor: "after-a" });
		expect(loadedPages(view)).toHaveLength(2);
	});

	test("does not observe while a batch is already in flight", async () => {
		answerList = (input) =>
			input.cursor
				? neverAnswers()
				: { items: [page("a")], nextCursor: "after-a" };
		renderList();
		await scrollToSentinel();
		await act(async () => {});
		expect(observed).toHaveLength(0);
	});

	test("does not re-observe after a failed batch, which would spin", async () => {
		answerList = (input) => {
			if (input.cursor) throw new Error("network down");
			return { items: [page("a")], nextCursor: "after-a" };
		};
		const { settled } = renderList();
		await scrollToSentinel();
		await settled();
		expect(observed).toHaveLength(0);
		expect(listInputs).toHaveLength(2);
	});
});

describe("PagesList counts", () => {
	test("takes the tab counts from the server, not from what it loaded", async () => {
		counts.all = 42;
		const { view, settled } = renderList();
		await settled();
		// One loaded page, 42 in the organization: the count is the server's.
		expect(view.getByRole("tab", { name: /All/ }).textContent).toContain("42");
		expect(loadedPages(view)).toHaveLength(1);
		expect(countsInputs[0]).toMatchObject({ pinnedIds: PINS });
	});

	test("offers the workspace filter off the server breakdown", async () => {
		const { view, settled } = renderList();
		await settled();
		expect(
			view.queryByRole("button", { name: /Filter by workspace/ }),
		).toBeTruthy();
	});

	test("hides the workspace filter when no workspace has pages", async () => {
		counts.workspaces = [];
		const { view, settled } = renderList();
		await settled();
		expect(
			view.queryByRole("button", { name: /Filter by workspace/ }),
		).toBeNull();
	});

	test("does not narrow the counts by the scope being counted", async () => {
		await renderList({ scope: "mine" }).settled();
		expect(countsInputs[0]).not.toHaveProperty("scope");
	});
});

describe("PagesList search", () => {
	test("does not strand typed text in the box when another filter changes", async () => {
		const { view, settled } = renderList();
		await settled();
		const box = view.getByPlaceholderText("Search pages") as HTMLInputElement;

		await act(async () => {
			fireEvent.change(box, { target: { value: "quarterly" } });
		});
		expect(box.value).toBe("quarterly");

		// Switching tabs inside the debounce window must not drop the pending
		// search: the box would keep showing text the grid was not filtered by.
		await act(async () => {
			const tab = view.getByRole("tab", { name: /Team/ });
			fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
			fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
			fireEvent.click(tab);
		});

		await waitFor(() =>
			expect(onSearchChange).toHaveBeenCalledWith("quarterly"),
		);
		expect(onScopeChange).toHaveBeenCalledWith("team");
	});
});

describe("PagesList empty state", () => {
	test("does not blank a loaded grid while the counts are still in flight", async () => {
		answerCounts = neverAnswers;
		const { view } = renderList();
		await waitFor(() => expect(loadedPages(view)).toHaveLength(1));
		expect(view.queryByRole("tab", { name: /All/ })).toBeTruthy();
	});

	test("keeps the tabs but drops their counts when the organization has no pages", async () => {
		answerList = () => ({ items: [], nextCursor: null });
		counts.all = 0;
		const { view, settled } = renderList();
		await settled();
		expect(view.getByRole("tab", { name: /All/ }).textContent).toBe("All");
	});
});

describe("PagesList error surfacing", () => {
	test("keeps the loaded pages on screen when a later batch fails", async () => {
		answerList = (input) => {
			if (input.cursor) throw new Error("network down");
			return { items: [page("a")], nextCursor: "after-a" };
		};
		const { view, settled } = renderList();
		await scrollToSentinel();
		await settled();
		expect(view.queryByText("network down")).toBeNull();
		expect(loadedPages(view)).toHaveLength(1);
	});

	test("shows the error when the first batch failed and nothing loaded", async () => {
		answerList = () => {
			throw new Error("network down");
		};
		const { view, settled } = renderList();
		await settled();
		expect(view.queryByText("network down")).toBeTruthy();
	});
});

describe("PagesList pinned tab", () => {
	test("stays on the pinned tab — the server already answered how many", async () => {
		await renderList({ scope: "pinned" }).settled();
		expect(onScopeChange).not.toHaveBeenCalled();
	});

	test("keeps the tab visible when the viewer is sitting on it with nothing pinned", async () => {
		counts.pinned = 0;
		const { view, settled } = renderList({ scope: "pinned" });
		await settled();
		expect(view.queryByText("Pinned")).toBeTruthy();
		expect(onScopeChange).not.toHaveBeenCalled();
	});
});
