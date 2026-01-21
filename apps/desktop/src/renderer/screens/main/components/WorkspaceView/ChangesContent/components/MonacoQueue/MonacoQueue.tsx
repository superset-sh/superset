import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

interface MonacoQueueContextValue {
	requestMount: (id: string, callback: () => void) => void;
	releaseMount: (id: string) => void;
}

const MonacoQueueContext = createContext<MonacoQueueContextValue | null>(null);

const MAX_CONCURRENT = 2;
const STAGGER_DELAY_MS = 100;

export function MonacoQueueProvider({ children }: { children: ReactNode }) {
	const activeCountRef = useRef(0);
	const queueRef = useRef<Array<{ id: string; callback: () => void }>>([]);
	const activeIdsRef = useRef<Set<string>>(new Set());

	const processNext = useCallback(() => {
		if (activeCountRef.current >= MAX_CONCURRENT) return;
		if (queueRef.current.length === 0) return;

		const next = queueRef.current.shift();
		if (!next) return;

		activeCountRef.current++;
		activeIdsRef.current.add(next.id);

		setTimeout(() => {
			next.callback();
			processNext();
		}, STAGGER_DELAY_MS);
	}, []);

	const requestMount = useCallback(
		(id: string, callback: () => void) => {
			if (activeIdsRef.current.has(id)) {
				callback();
				return;
			}

			const existingIndex = queueRef.current.findIndex((q) => q.id === id);
			if (existingIndex >= 0) {
				queueRef.current[existingIndex].callback = callback;
				return;
			}

			queueRef.current.push({ id, callback });
			processNext();
		},
		[processNext],
	);

	const releaseMount = useCallback((id: string) => {
		queueRef.current = queueRef.current.filter((q) => q.id !== id);
		if (activeIdsRef.current.has(id)) {
			activeIdsRef.current.delete(id);
			activeCountRef.current = Math.max(0, activeCountRef.current - 1);
		}
	}, []);

	const value = useMemo(
		() => ({ requestMount, releaseMount }),
		[requestMount, releaseMount],
	);

	return (
		<MonacoQueueContext.Provider value={value}>
			{children}
		</MonacoQueueContext.Provider>
	);
}

export function useMonacoQueue(id: string, shouldMount: boolean) {
	const context = useContext(MonacoQueueContext);
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		if (!shouldMount) {
			setIsReady(false);
			context?.releaseMount(id);
			return;
		}

		if (!context) {
			setIsReady(true);
			return;
		}

		context.requestMount(id, () => setIsReady(true));

		return () => {
			context.releaseMount(id);
		};
	}, [context, id, shouldMount]);

	return isReady;
}
