interface SessionRoute {
	workerId: string;
	attachedClientIds: Set<string>;
	exited: boolean;
}

export interface DetachedSessionRoute {
	sessionId: string;
	workerId: string;
	shouldDetachWorker: boolean;
	wasExited: boolean;
}

export interface RoutedSessionClients {
	sessionId: string;
	workerId: string;
	clientIds: string[];
}

export class SupervisorSessionRouting {
	private readonly routes = new Map<string, SessionRoute>();

	private getOrCreateRoute(sessionId: string, workerId: string): SessionRoute {
		const route = this.routes.get(sessionId) ?? {
			workerId,
			attachedClientIds: new Set<string>(),
			exited: false,
		};

		route.workerId = workerId;
		route.exited = false;
		this.routes.set(sessionId, route);
		return route;
	}

	restoreSession({
		sessionId,
		workerId,
	}: {
		sessionId: string;
		workerId: string;
	}): void {
		this.getOrCreateRoute(sessionId, workerId);
	}

	attachSession({
		sessionId,
		workerId,
		clientId,
	}: {
		sessionId: string;
		workerId: string;
		clientId: string;
	}): void {
		const route = this.getOrCreateRoute(sessionId, workerId);
		route.attachedClientIds.add(clientId);
	}

	detachSession({
		sessionId,
		clientId,
	}: {
		sessionId: string;
		clientId: string;
	}): DetachedSessionRoute | null {
		const route = this.routes.get(sessionId);
		if (!route) return null;

		const hadAttachment = route.attachedClientIds.delete(clientId);
		if (!hadAttachment) return null;

		const shouldDetachWorker = route.attachedClientIds.size === 0;
		if (shouldDetachWorker && route.exited) {
			this.routes.delete(sessionId);
		}

		return {
			sessionId,
			workerId: route.workerId,
			shouldDetachWorker,
			wasExited: route.exited,
		};
	}

	detachClient(clientId: string): DetachedSessionRoute[] {
		const detachedRoutes: DetachedSessionRoute[] = [];

		for (const sessionId of this.routes.keys()) {
			const detachedRoute = this.detachSession({ sessionId, clientId });
			if (detachedRoute) {
				detachedRoutes.push(detachedRoute);
			}
		}

		return detachedRoutes;
	}

	markSessionExited(sessionId: string): void {
		const route = this.routes.get(sessionId);
		if (!route) return;

		route.exited = true;
		if (route.attachedClientIds.size === 0) {
			this.routes.delete(sessionId);
		}
	}

	getAttachedClientIds(sessionId: string): string[] {
		return [...(this.routes.get(sessionId)?.attachedClientIds ?? [])];
	}

	getWorkerId(sessionId: string): string | null {
		return this.routes.get(sessionId)?.workerId ?? null;
	}

	getAttachedClientCount(sessionId: string): number {
		return this.routes.get(sessionId)?.attachedClientIds.size ?? 0;
	}

	hasRoutedSessions(workerId: string): boolean {
		for (const route of this.routes.values()) {
			if (route.workerId === workerId && !route.exited) {
				return true;
			}
		}

		return false;
	}

	clearWorkerRoutes(workerId: string): RoutedSessionClients[] {
		const clearedRoutes: RoutedSessionClients[] = [];

		for (const [sessionId, route] of this.routes.entries()) {
			if (route.workerId !== workerId) continue;

			clearedRoutes.push({
				sessionId,
				workerId: route.workerId,
				clientIds: [...route.attachedClientIds],
			});
			this.routes.delete(sessionId);
		}

		return clearedRoutes;
	}

	clear(): void {
		this.routes.clear();
	}
}
