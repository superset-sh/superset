import { Trans, useLingui } from "@lingui/react/macro";
import { Play, Plus, RotateCw, Search } from "lucide-react";
import { RunStatusDot } from "../RunStatusDot";
import { ROWS, SPARKLINE } from "./constants";

const CARD = "rounded-lg border border-border px-3.5 py-2.5";
const LABEL = "text-muted-foreground text-xs";
const VALUE = "mt-0.5 font-medium text-lg tabular-nums leading-tight";
const COLUMNS =
	"grid grid-cols-[minmax(0,1fr)_auto] gap-4 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_1.5rem]";

export function AutomationsListWindow() {
	const { t } = useLingui();
	const sparkMax = Math.max(...SPARKLINE.map((bar) => bar.count));

	return (
		<div
			aria-hidden="true"
			className="mt-14 border border-border bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,128,74,0.08),transparent_60%)] p-3 sm:p-10"
		>
			<div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
				<div className="flex items-center gap-3 px-4 pt-5 sm:px-6">
					<p className="font-medium text-foreground text-xl tracking-tight">
						<Trans>Automations</Trans>
					</p>
					<span className="ml-auto flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-background text-xs">
						<Plus className="size-3.5" />
						<Trans>New automation</Trans>
					</span>
				</div>

				<div className="mt-5 grid grid-cols-2 gap-2 px-4 sm:px-6 lg:grid-cols-4">
					<div className={CARD}>
						<p className={LABEL}>
							<Trans>Total automations</Trans>
						</p>
						<p className={VALUE}>5</p>
					</div>
					<div className={CARD}>
						<p className={LABEL}>
							<Trans>Successful runs</Trans>
							<span className="text-muted-foreground/60"> · 7d</span>
						</p>
						<p className={VALUE}>
							31
							<span className="ml-1.5 font-normal text-muted-foreground text-xs">
								97%
							</span>
						</p>
					</div>
					<div className={CARD}>
						<p className={LABEL}>
							<Trans>Failed runs</Trans>
							<span className="text-muted-foreground/60"> · 7d</span>
						</p>
						<p className={VALUE}>
							1
							<span className="ml-1.5 font-normal text-muted-foreground text-xs">
								3%
							</span>
						</p>
					</div>
					<div className={CARD}>
						<p className={LABEL}>
							<Trans>Run History</Trans> →
						</p>
						<div className="mt-1.5 flex h-6 items-end gap-[3px]">
							{SPARKLINE.map((bar) => (
								<div
									key={bar.slot}
									className={`flex-1 rounded-[1px] ${bar.count > 0 ? "bg-emerald-600" : "bg-muted-foreground/20"}`}
									style={{
										height:
											bar.count > 0
												? `${Math.max((bar.count / sparkMax) * 100, 16)}%`
												: "2px",
									}}
								/>
							))}
						</div>
					</div>
				</div>

				<div className="mt-5 flex items-center gap-1 px-4 text-sm sm:px-6">
					<span className="rounded-md bg-muted px-2.5 py-1 text-foreground">
						<Trans>Mine</Trans>
						<span className="ml-1 text-muted-foreground text-xs tabular-nums">
							5
						</span>
					</span>
					<span className="px-2.5 py-1 text-muted-foreground">
						<Trans>Team</Trans>
						<span className="ml-1 text-xs tabular-nums">12</span>
					</span>
					<span className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-foreground text-xs">
						<RotateCw className="size-3.5" />
						<Trans>Retry all</Trans>
					</span>
					<span className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground text-xs sm:flex">
						<Search className="size-3.5" />
						<Trans>Search</Trans>
					</span>
				</div>

				<div className="mx-4 mt-3 mb-5 rounded-xl border border-border text-sm sm:mx-6">
					<div
						className={`${COLUMNS} border-border border-b px-4 py-2 text-muted-foreground text-xs`}
					>
						<span>
							<Trans>Name</Trans>
						</span>
						<span className="hidden sm:block">
							<Trans>Schedule</Trans>
						</span>
						<span className="hidden sm:block">
							<Trans>Status</Trans>
						</span>
						<span>
							<Trans>Last run</Trans>
						</span>
						<span className="hidden sm:block" />
					</div>
					{ROWS.map((row) => {
						const failed = row.lastRun.status === "failed";
						return (
							<div
								key={row.id}
								className={`${COLUMNS} items-center border-border/50 border-b px-4 py-2.5 last:border-b-0 ${failed ? "bg-muted/40" : ""}`}
							>
								<span className="flex min-w-0 items-center gap-2">
									<span
										className={`truncate font-medium ${row.nextRun ? "text-foreground" : "text-muted-foreground"}`}
									>
										{t(row.name)}
									</span>
									<span className="hidden shrink-0 items-center gap-1.5 text-muted-foreground text-xs md:flex">
										{row.project ? (
											<>
												<span className="flex size-3.5 items-center justify-center rounded-sm bg-muted font-mono text-[8px] uppercase">
													{row.project.charAt(0)}
												</span>
												{row.project}
											</>
										) : (
											<Trans>Session</Trans>
										)}
									</span>
								</span>
								<span className="hidden truncate text-muted-foreground text-xs sm:block">
									{t(row.schedule)}
								</span>
								<span className="hidden truncate text-muted-foreground text-xs sm:block">
									{row.nextRun ? (
										<>
											<Trans>Active</Trans>
											<span className="text-muted-foreground/60">
												{" · "}
												{t(row.nextRun)}
											</span>
										</>
									) : (
										<Trans>Paused</Trans>
									)}
								</span>
								<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
									<RunStatusDot status={row.lastRun.status} />
									{failed ? <Trans>failed</Trans> : <Trans>created</Trans>}
									<span className="truncate text-muted-foreground/70">
										{t(row.lastRun.ago)}
									</span>
								</span>
								<span className="hidden justify-end text-foreground sm:flex">
									{failed && <Play className="size-4" />}
								</span>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
