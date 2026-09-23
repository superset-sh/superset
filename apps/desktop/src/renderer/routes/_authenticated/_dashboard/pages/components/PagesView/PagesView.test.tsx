import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom is process-wide; unregister in afterAll so the shared mock
// document is restored for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface ListPage {
	items: Array<{
		id: string;
		title: string;
		slug: string;
		visibility: string;
	}>;
	nextCursor: string | null;
}

interface InfiniteResult {
	data?: { pages: ListPage[] };
	error?: { message: string } | null;
	isPending: boolean;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	isFetchNextPageError: boolean;
	fetchNextPage: () => void;
}

const fetchNextPage = mock(() => {});

let listResult: InfiniteResult;
let listInput: Record<string, unknown> | undefined;
let countsInput: Record<string, unknown> | undefined;
let countsData: {
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
};

/** Lets a test fire the sentinel without a real viewport. */
const observed: Array<() => void> = [];
class TestIntersectionObserver {
	constructor(
		private callback: (entries: Array<{ isIntersecting: boolean }>) => void,
	) {}
	observe() {
		observed.push(() => this.callback([{ isIntersecting: true }]));
	}
	disconnect() {}
}
(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
	TestIntersectionObserver;

function page(id: string, visibility = "org") {
	return { id, title: `Page ${id}`, slug: `page-${id}`, visibility };
}

mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		page: {
			list: {
				useInfiniteQuery: (input: Record<string, unknown>) => {
					listInput = input;
					return listResult;
				},
			},
			counts: {
				useQuery: (input: Record<string, unknown>) => {
					countsInput = input;
					return { data: countsData };
				},
			},
			delete: { useMutation: () => ({ mutateAsync: mock() }) },
		},
		useUtils: () => ({
			page: {
				list: {
					cancel: mock(async () => {}),
					getInfiniteData: mock(() => undefined),
					setInfiniteData: mock(),
					invalidate: mock(),
				},
				counts: { invalidate: mock() },
			},
		}),
	},
}));

mock.module("renderer/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

// The grid pulls in page cards, thumbnails and the whole UI kit. This suite is
// about what PagesView hands it, so record the props instead of rendering them.
let gridProps: { pages: unknown[]; error?: string; isPending: boolean };
mock.module("../PagesGrid", () => ({
	PagesGrid: (props: typeof gridProps) => {
		gridProps = props;
		return null;
	},
}));

const onScopeChange = mock((_scope: string) => {});

mock.module("./hooks/useCreatePageWithAgent", () => ({
	useCreatePageWithAgent: () => ({
		creatingWithAgent: false,
		handleCreateWithAgent: mock(),
	}),
}));

const PINS = ["pin-1", "pin-2"];
mock.module(
	"renderer/routes/_authenticated/_dashboard/hooks/usePageFavorites",
	() => ({
		usePageFavorites: () => ({
			favoritePageIds: PINS,
			favoritePageIdSet: new Set(PINS),
			toggleFavorite: mock(),
		}),
	}),
);

mock.module(
	"renderer/routes/_authenticated/_dashboard/hooks/useOpenPage",
	() => ({
		useOpenPage: () => mock(),
		isPaneModifier: () => false,
	}),
);

mock.module("../../hooks/usePageWorkspaceNames", () => ({
	usePageWorkspaceNames: () => new Map([["ws-1", "Workspace One"]]),
}));

const { act, cleanup, render } = await import("@testing-library/react");
const { PagesView } = await import("./PagesView");

function renderView({
	scope = "all" as "all" | "pinned" | "team" | "mine",
	search = "",
	authorId = null as string | null,
	workspaceId = null as string | null,
} = {}) {
	return render(
		<PagesView
			search={search}
			scope={scope}
			authorId={authorId}
			workspaceId={workspaceId}
			onSearchChange={mock()}
			onScopeChange={onScopeChange}
			onAuthorChange={mock()}
			onWorkspaceChange={mock()}
		/>,
	);
}

beforeEach(() => {
	fetchNextPage.mockClear();
	onScopeChange.mockClear();
	observed.length = 0;
	listInput = undefined;
	countsInput = undefined;
	countsData = {
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
	listResult = {
		data: { pages: [{ items: [page("a")], nextCursor: null }] },
		error: null,
		isPending: false,
		hasNextPage: false,
		isFetchingNextPage: false,
		isFetchNextPageError: false,
		fetchNextPage,
	};
});

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("PagesView server-side filtering", () => {
	test("sends the search to the server instead of filtering what it loaded", async () => {
		await act(async () => {
			renderView({ search: "report" });
		});
		expect(listInput).toMatchObject({ search: "report" });
	});

	test("sends the scope, the author and the workspace too", async () => {
		await act(async () => {
			renderView({ scope: "team", authorId: "user-1", workspaceId: "ws-1" });
		});
		expect(listInput).toMatchObject({
			scope: "team",
			authorId: "user-1",
			workspaceId: "ws-1",
		});
	});

	test("asks for the pinned tab by id, because pins are not a server column", async () => {
		await act(async () => {
			renderView({ scope: "pinned" });
		});
		expect(listInput).toMatchObject({ scope: "all", ids: PINS });
	});

	test("asks for one batch, not the whole organization", async () => {
		await act(async () => {
			renderView();
		});
		expect(listInput?.limit).toBe(50);
	});
});

describe("PagesView loads on scroll", () => {
	test("does not sweep the organization on mount", async () => {
		listResult.hasNextPage = true;
		await act(async () => {
			renderView();
		});
		expect(fetchNextPage).not.toHaveBeenCalled();
	});

	test("fetches the next batch when the sentinel comes into view", async () => {
		listResult.hasNextPage = true;
		await act(async () => {
			renderView();
		});
		expect(observed.length).toBeGreaterThan(0);
		await act(async () => {
			for (const fire of observed) fire();
		});
		expect(fetchNextPage).toHaveBeenCalled();
	});

	test("does not observe while a batch is already in flight", async () => {
		listResult.hasNextPage = true;
		listResult.isFetchingNextPage = true;
		await act(async () => {
			renderView();
		});
		expect(observed).toHaveLength(0);
	});

	test("does not re-observe after a failed batch, which would spin", async () => {
		listResult.hasNextPage = true;
		listResult.isFetchNextPageError = true;
		await act(async () => {
			renderView();
		});
		expect(observed).toHaveLength(0);
	});
});

describe("PagesView counts", () => {
	test("takes the tab counts from the server, not from what it loaded", async () => {
		countsData.all = 42;
		const view = await act(async () => renderView());
		const allTab = view.getByRole("tab", { name: /All/ });
		// One loaded page, 42 in the organization: the count is the server's.
		expect(allTab.textContent).toContain("42");
		expect(gridProps.pages).toHaveLength(1);
		expect(countsInput).toMatchObject({ pinnedIds: PINS });
	});

	test("offers the workspace filter off the server breakdown", async () => {
		const view = await act(async () => renderView());
		expect(
			view.queryByRole("button", { name: /Filter by workspace/ }),
		).toBeTruthy();
	});

	test("hides the workspace filter when no workspace has pages", async () => {
		countsData.workspaces = [];
		const view = await act(async () => renderView());
		expect(
			view.queryByRole("button", { name: /Filter by workspace/ }),
		).toBeNull();
	});

	test("does not narrow the counts by the scope being counted", async () => {
		await act(async () => {
			renderView({ scope: "mine" });
		});
		expect(countsInput).not.toHaveProperty("scope");
	});
});

describe("PagesView empty state", () => {
	test("does not blank a loaded grid while the counts are still in flight", async () => {
		countsData = undefined as never;
		const view = await act(async () => renderView());
		expect(gridProps.pages).toHaveLength(1);
		// The filter bar is hidden only when the organization really has no pages.
		expect(view.queryByRole("tab", { name: /All/ })).toBeTruthy();
	});

	test("hides the filters when the organization has no pages at all", async () => {
		listResult.data = { pages: [{ items: [], nextCursor: null }] };
		countsData.all = 0;
		const view = await act(async () => renderView());
		expect(view.queryByRole("tab", { name: /All/ })).toBeNull();
	});
});

describe("PagesView error surfacing", () => {
	test("keeps the loaded pages on screen when a later batch fails", async () => {
		listResult.hasNextPage = true;
		listResult.isFetchNextPageError = true;
		listResult.error = { message: "network down" };
		await act(async () => {
			renderView();
		});
		expect(gridProps.error).toBeUndefined();
		expect(gridProps.pages).toHaveLength(1);
	});

	test("retries the failed batch on demand", async () => {
		listResult.hasNextPage = true;
		listResult.isFetchNextPageError = true;
		listResult.error = { message: "network down" };
		const view = await act(async () => renderView());
		const retry = view.getByRole("button", { name: "Retry" });
		fetchNextPage.mockClear();
		await act(async () => {
			retry.click();
		});
		expect(fetchNextPage).toHaveBeenCalled();
	});

	test("stays quiet while paging is going fine", async () => {
		listResult.hasNextPage = true;
		const view = await act(async () => renderView());
		expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
	});

	test("shows the error when the first batch failed and nothing loaded", async () => {
		listResult.data = { pages: [] };
		listResult.error = { message: "network down" };
		await act(async () => {
			renderView();
		});
		expect(gridProps.error).toBe("network down");
	});
});

describe("PagesView pinned tab", () => {
	test("stays on the pinned tab — the server already answered how many", async () => {
		await act(async () => {
			renderView({ scope: "pinned" });
		});
		expect(onScopeChange).not.toHaveBeenCalled();
	});

	test("keeps the tab visible when the viewer is sitting on it with nothing pinned", async () => {
		countsData.pinned = 0;
		const view = await act(async () => renderView({ scope: "pinned" }));
		expect(view.queryByText("Pinned")).toBeTruthy();
		expect(onScopeChange).not.toHaveBeenCalled();
	});
});
