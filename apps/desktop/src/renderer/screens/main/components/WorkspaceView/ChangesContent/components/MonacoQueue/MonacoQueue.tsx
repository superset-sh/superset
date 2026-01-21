import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

interface MonacoQueueContextValue {
	requestMount: (id: string) => void;
	releaseMount: (id: string) => void;
	canMount: (id: string) => boolean;
}

const MonacoQueueContext = createContext<MonacoQueueContextValue | null>(null);

const MAX_CONCURRENT_MOUNTS = 2;
const MOUNT_DELAY_MS = 50;

export function MonacoQueueProvider({ children }: { children: ReactNode }) {
	const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set());
	const queueRef = useRef<string[]>([]);
	const processingRef = useRef(false);

	const processQueue = useCallback(() => {
		if (processingRef.current) return;
		processingRef.current = true;

		const process = () => {
			setMountedIds((current) => {
				if (
					current.size >= MAX_CONCURRENT_MOUNTS ||
					queueRef.current.length === 0
				) {
					processingRef.current = false;
					return current;
				}

				const nextId = queueRef.current.shift();
				if (!nextId || current.has(nextId)) {
					processingRef.current = false;
					if (queueRef.current.length > 0) {
						setTimeout(() => {
							processingRef.current = false;
							processQueue();
						}, MOUNT_DELAY_MS);
					}
					return current;
				}

				const next = new Set(current);
				next.add(nextId);

				if (queueRef.current.length > 0) {
					setTimeout(() => {
						processingRef.current = false;
						processQueue();
					}, MOUNT_DELAY_MS);
				} else {
					processingRef.current = false;
				}

				return next;
			});
		};

		requestAnimationFrame(process);
	}, []);

	const requestMount = useCallback(
		(id: string) => {
			if (!queueRef.current.includes(id)) {
				queueRef.current.push(id);
				processQueue();
			}
		},
		[processQueue],
	);

	const releaseMount = useCallback((id: string) => {
		queueRef.current = queueRef.current.filter((qId) => qId !== id);
		setMountedIds((current) => {
			if (!current.has(id)) return current;
			const next = new Set(current);
			next.delete(id);
			return next;
		});
	}, []);

	const canMount = useCallback(
		(id: string) => mountedIds.has(id),
		[mountedIds],
	);

	return (
		<MonacoQueueContext.Provider
			value={{ requestMount, releaseMount, canMount }}
		>
			{children}
		</MonacoQueueContext.Provider>
	);
}

export function useMonacoQueue(id: string, shouldMount: boolean) {
	const context = useContext(MonacoQueueContext);
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		if (!context) {
			setIsReady(shouldMount);
			return;
		}

		if (shouldMount) {
			context.requestMount(id);
		} else {
			context.releaseMount(id);
			setIsReady(false);
		}

		return () => {
			context.releaseMount(id);
		};
	}, [context, id, shouldMount]);

	useEffect(() => {
		if (!context) return;

		const checkReady = () => {
			const ready = context.canMount(id);
			setIsReady(ready);
		};

		checkReady();
		const interval = setInterval(checkReady, 50);
		return () => clearInterval(interval);
	}, [context, id]);

	return isReady;
}
