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
	nextCursor: { updatedAt: string; id: string } | null;
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

function page(id: string, visibility = "org") {
	return { id, title: `Page ${id}`, slug: `page-${id}`, visibility };
}

mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		page: {
			list: { useInfiniteQuery: () => listResult },
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

mock.module("./hooks/usePageFavorites", () => ({
	usePageFavorites: () => ({
		favoritePageIdSet: new Set<string>(),
		toggleFavorite: mock(),
	}),
}));

mock.module(
	"renderer/routes/_authenticated/_dashboard/hooks/useOpenPage",
	() => ({
		useOpenPage: () => mock(),
		isPaneModifier: () => false,
	}),
);

const { act, cleanup, render } = await import("@testing-library/react");
const { PagesView } = await import("./PagesView");

function renderView(scope: "all" | "pinned" = "all") {
	return render(
		<PagesView
			search=""
			scope={scope}
			onSearchChange={mock()}
			onScopeChange={onScopeChange}
		/>,
	);
}

beforeEach(() => {
	fetchNextPage.mockClear();
	onScopeChange.mockClear();
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

describe("PagesView drain", () => {
	test("keeps pulling batches while the server reports more", async () => {
		listResult.hasNextPage = true;
		await act(async () => {
			renderView();
		});
		expect(fetchNextPage).toHaveBeenCalled();
	});

	test("does not re-arm while a batch is already in flight", async () => {
		listResult.hasNextPage = true;
		listResult.isFetchingNextPage = true;
		await act(async () => {
			renderView();
		});
		expect(fetchNextPage).not.toHaveBeenCalled();
	});

	test("stops after a failed batch instead of looping forever", async () => {
		listResult.hasNextPage = true;
		listResult.isFetchNextPageError = true;
		listResult.error = { message: "network down" };
		await act(async () => {
			renderView();
		});
		expect(fetchNextPage).not.toHaveBeenCalled();
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

	test("says the list is short, and retries the batch on demand", async () => {
		listResult.hasNextPage = true;
		listResult.isFetchNextPageError = true;
		listResult.error = { message: "network down" };
		const view = await act(async () => renderView());
		const retry = view.getByRole("button", { name: "Retry" });
		expect(retry).toBeTruthy();
		fetchNextPage.mockClear();
		await act(async () => {
			retry.click();
		});
		expect(fetchNextPage).toHaveBeenCalled();
	});

	test("stays quiet while the sweep is still going fine", async () => {
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
	test("stays put while later batches could still contain pinned pages", async () => {
		listResult.hasNextPage = true;
		await act(async () => {
			renderView("pinned");
		});
		expect(onScopeChange).not.toHaveBeenCalled();
	});

	test("stays put on a cold mount, before the first batch has landed", async () => {
		listResult.data = undefined;
		listResult.isPending = true;
		await act(async () => {
			renderView("pinned");
		});
		expect(onScopeChange).not.toHaveBeenCalled();
	});

	test("falls back to all once the sweep finished with nothing pinned", async () => {
		await act(async () => {
			renderView("pinned");
		});
		expect(onScopeChange).toHaveBeenCalledWith("all");
	});
});
