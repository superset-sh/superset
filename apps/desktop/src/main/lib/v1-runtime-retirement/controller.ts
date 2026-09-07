export interface V1RuntimeReport {
	organizationId: string;
	/** The persisted migration marker was present when this renderer booted. */
	migratedAtBoot: boolean;
	v2Enabled: boolean;
}

interface RuntimeWindow {
	id: number;
	organizationId: string | null;
}

/**
 * The v1 daemon is shared. Unknown windows and reversible v2 opt-ins must
 * veto retirement. Reports are scoped to both window and organization so
 * switching orgs cannot reuse the previous org's migration permission.
 */
export class V1RuntimeRetirementController {
	private reports = new Map<number, V1RuntimeReport>();
	private pending: Promise<boolean> | null = null;
	private retired = false;

	constructor(
		private readonly windows: () => RuntimeWindow[],
		private readonly retire: (stillEligible: () => boolean) => Promise<boolean>,
	) {}

	forget(windowId: number): void {
		this.reports.delete(windowId);
		this.retired = false;
	}

	report(windowId: number, report: V1RuntimeReport): Promise<boolean> {
		// A new window, reload or org switch may have used v1 since the last
		// successful cleanup. Its eventual locked report needs a fresh probe.
		if (!this.isEligible()) this.retired = false;
		const windows = this.windows();
		for (const id of this.reports.keys()) {
			if (!windows.some((window) => window.id === id)) this.reports.delete(id);
		}
		const window = windows.find((candidate) => candidate.id === windowId);
		if (!window || window.organizationId !== report.organizationId) {
			this.forget(windowId);
			return Promise.resolve(false);
		}
		this.reports.set(windowId, report);
		if (!this.isEligible()) {
			this.retired = false;
			return Promise.resolve(false);
		}
		if (this.retired) return Promise.resolve(true);
		if (this.pending) return this.pending;
		const windowSet = this.windowSet();
		this.pending = this.retire(
			() => this.isEligible() && this.windowSet() === windowSet,
		)
			.then((retired) => {
				this.retired =
					retired && this.isEligible() && this.windowSet() === windowSet;
				return this.retired;
			})
			.finally(() => {
				this.pending = null;
			});
		return this.pending;
	}

	private windowSet(): string {
		return JSON.stringify(
			this.windows().map(({ id, organizationId }) => [id, organizationId]),
		);
	}

	isEligible(): boolean {
		const windows = this.windows();
		return (
			windows.length > 0 &&
			windows.every((window) => {
				const report = this.reports.get(window.id);
				return (
					report?.organizationId === window.organizationId &&
					report?.migratedAtBoot === true &&
					report.v2Enabled
				);
			})
		);
	}

	/** Every visible org must have migrated a session before it can be killed. */
	organizationIds(): string[] {
		return [
			...new Set(
				this.windows().flatMap((window) =>
					window.organizationId ? [window.organizationId] : [],
				),
			),
		];
	}
}
