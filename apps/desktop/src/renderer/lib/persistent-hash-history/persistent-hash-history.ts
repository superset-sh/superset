import {
	createHistory,
	type HistoryLocation,
	type RouterHistory,
} from "@tanstack/react-router";

const STORAGE_KEY = "router-history";
const MAX_ENTRIES = 100;

type LocationState = HistoryLocation["state"];

interface PersistedState {
	entries: string[];
	index: number;
}

export interface HistoryEntry {
	path: string;
	timestamp: number;
}

function loadPersistedState(): PersistedState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as PersistedState;
			if (
				Array.isArray(parsed.entries) &&
				parsed.entries.length > 0 &&
				parsed.entries.every((e) => typeof e === "string" && e.length > 0) &&
				typeof parsed.index === "number"
			) {
				const index = Math.min(
					Math.max(parsed.index, 0),
					parsed.entries.length - 1,
				);
				return { entries: parsed.entries, index };
			}
		}
	} catch {}
	return { entries: ["/"], index: 0 };
}

function persistState(entries: string[], index: number) {
	try {
		const capped =
			entries.length > MAX_ENTRIES
				? entries.slice(entries.length - MAX_ENTRIES)
				: entries;
		const cappedIndex =
			entries.length > MAX_ENTRIES
				? Math.max(0, index - (entries.length - MAX_ENTRIES))
				: index;
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ entries: capped, index: cappedIndex }),
		);
	} catch {}
}

function syncHash(path: string) {
	window.history.replaceState(window.history.state, "", `#${path}`);
}

function getHashPath(): string {
	const hash = window.location.hash;
	if (!hash || hash === "#") return "/";
	return hash.startsWith("#") ? hash.slice(1) : hash;
}

function getInitialHashPath(): string | null {
	const hash = window.location.hash;
	// registerRoute bootstraps the app at #/ so persisted history can restore the
	// last route. Any more specific initial hash is an intentional deep link.
	if (!hash || hash === "#" || hash === "#/") return null;
	return getHashPath();
}

function findNearestEntryIndex(
	entries: string[],
	currentIndex: number,
	path: string,
): number {
	for (let distance = 1; distance < entries.length; distance++) {
		const backwardIndex = currentIndex - distance;
		if (backwardIndex >= 0 && entries[backwardIndex] === path) {
			return backwardIndex;
		}

		const forwardIndex = currentIndex + distance;
		if (forwardIndex < entries.length && entries[forwardIndex] === path) {
			return forwardIndex;
		}
	}
	return -1;
}

function createRandomKey(): string {
	return (Math.random() + 1).toString(36).substring(7);
}

function assignKeyAndIndex(
	index: number,
	state?: LocationState,
): LocationState {
	const key = createRandomKey();
	return {
		...(state ?? {}),
		key,
		__TSR_key: key,
		__TSR_index: index,
	};
}

function parseHref(href: string, state: LocationState): HistoryLocation {
	const searchIndex = href.indexOf("?");
	const hashIndex = href.indexOf("#");
	return {
		href,
		pathname: href.substring(
			0,
			hashIndex > 0
				? searchIndex > 0
					? Math.min(hashIndex, searchIndex)
					: hashIndex
				: searchIndex > 0
					? searchIndex
					: href.length,
		),
		hash: hashIndex > -1 ? href.substring(hashIndex) : "",
		search:
			searchIndex > -1
				? href.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex)
				: "",
		state,
	};
}

export interface PersistentHashHistory extends RouterHistory {
	getEntries: () => HistoryEntry[];
}

export function createPersistentHashHistory(): PersistentHashHistory {
	const persisted = loadPersistedState();

	const entries: string[] = [...persisted.entries];
	let index = persisted.index;
	const initialHashPath = getInitialHashPath();
	if (initialHashPath && initialHashPath !== entries[index]) {
		const existingIndex = findNearestEntryIndex(
			entries,
			index,
			initialHashPath,
		);
		if (existingIndex >= 0) {
			index = existingIndex;
		} else {
			entries.splice(index + 1);
			entries.push(initialHashPath);
			index = entries.length - 1;
		}
		persistState(entries, index);
	}

	const timestamps: number[] = entries.map(() => Date.now());
	const states: LocationState[] = entries.map((_entry, i) =>
		assignKeyAndIndex(i),
	);

	const getLocation = () =>
		parseHref(entries[index] ?? "/", states[index] ?? assignKeyAndIndex(index));

	let blockers: Parameters<
		NonNullable<Parameters<typeof createHistory>[0]["setBlockers"]>
	>[0] = [];

	syncHash(entries[index] ?? "/");

	let history: RouterHistory;
	const synchronizeExternalNavigation = (
		navigationType?: NavigationCurrentEntryChangeEvent["navigationType"],
	) => {
		const path = getHashPath();
		if (path === (entries[index] ?? "/")) return;

		// The browser URL has already changed, so a blocker cannot safely cancel
		// this navigation without leaving the URL and router out of sync.
		const navigateOptions = { ignoreBlocker: true };
		if (navigationType === "replace") {
			history.replace(path, undefined, navigateOptions);
			return;
		}
		if (navigationType === "push") {
			history.push(path, undefined, navigateOptions);
			return;
		}

		const existingIndex = findNearestEntryIndex(entries, index, path);
		if (existingIndex >= 0) {
			const delta = existingIndex - index;
			if (delta === -1) {
				history.back(navigateOptions);
				return;
			}
			if (delta === 1) {
				history.forward(navigateOptions);
				return;
			}
			history.go(delta, navigateOptions);
			return;
		}
		history.push(path, undefined, navigateOptions);
	};
	const handleExternalHashChange = () => synchronizeExternalNavigation();
	const handleCurrentEntryChange = (event: NavigationCurrentEntryChangeEvent) =>
		synchronizeExternalNavigation(event.navigationType);
	const navigationApi = window.navigation;

	history = createHistory({
		getLocation,
		getLength: () => entries.length,
		pushState: (path, state) => {
			if (index < entries.length - 1) {
				entries.splice(index + 1);
				timestamps.splice(index + 1);
				states.splice(index + 1);
			}
			entries.push(path);
			timestamps.push(Date.now());
			states.push(state as LocationState);
			index = entries.length - 1;
			syncHash(path);
			persistState(entries, index);
		},
		replaceState: (path, state) => {
			entries[index] = path;
			timestamps[index] = Date.now();
			states[index] = state as LocationState;
			syncHash(path);
			persistState(entries, index);
		},
		back: () => {
			index = Math.max(index - 1, 0);
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		forward: () => {
			index = Math.min(index + 1, entries.length - 1);
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		go: (n) => {
			index = Math.min(Math.max(index + n, 0), entries.length - 1);
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		createHref: (path) =>
			`${window.location.pathname}${window.location.search}#${path}`,
		getBlockers: () => blockers,
		setBlockers: (newBlockers) => {
			blockers = newBlockers;
		},
		destroy: () => {
			if (navigationApi) {
				navigationApi.removeEventListener(
					"currententrychange",
					handleCurrentEntryChange,
				);
			} else {
				window.removeEventListener("hashchange", handleExternalHashChange);
			}
		},
	});
	if (navigationApi) {
		navigationApi.addEventListener(
			"currententrychange",
			handleCurrentEntryChange,
		);
	} else {
		window.addEventListener("hashchange", handleExternalHashChange);
	}

	return Object.assign(history, {
		getEntries: (): HistoryEntry[] =>
			entries.map((path, i) => ({
				path,
				timestamp: timestamps[i] ?? 0,
			})),
	});
}

export const persistentHistory = createPersistentHashHistory();
