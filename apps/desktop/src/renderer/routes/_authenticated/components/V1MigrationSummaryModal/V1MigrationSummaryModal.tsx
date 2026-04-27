import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuFolder,
	LuLayoutGrid,
	LuTriangle,
} from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { V1_MIGRATION_SUMMARY_EVENT } from "renderer/routes/_authenticated/hooks/useMigrateV1DataToV2";
import { MOCK_ORG_ID } from "shared/constants";

const Dithering = lazy(() =>
	import("@paper-design/shaders-react").then((mod) => ({
		default: mod.Dithering,
	})),
);

type MigrationPage = "welcome" | "results";
type ProjectStatus = "created" | "linked" | "synced" | "error";
type WorkspaceStatus = "adopted" | "synced" | "skipped" | "error";

interface ProjectEntry {
	name: string;
	status: ProjectStatus;
	reason?: string;
}

interface WorkspaceEntry {
	name: string;
	branch: string;
	status: WorkspaceStatus;
	reason?: string;
}

interface MigrationSummary {
	projectsCreated: number;
	projectsLinked: number;
	projectsErrored: number;
	workspacesCreated: number;
	workspacesSkipped: number;
	workspacesErrored: number;
	projects: ProjectEntry[];
	workspaces: WorkspaceEntry[];
	errors: Array<{ kind: string; name: string; message: string }>;
}

interface StoredEntry {
	summary: MigrationSummary;
	createdAt: number;
}

interface ModalUiState {
	page: MigrationPage;
	isTransitioning: boolean;
	expandedSection: "projects" | "workspaces" | "errors" | null;
}

const INITIAL_MODAL_UI_STATE: ModalUiState = {
	page: "welcome",
	isTransitioning: false,
	expandedSection: null,
};

const GRADIENT_COLORS = [
	"#f97316",
	"#fb923c",
	"#f59e0b",
	"#431407",
] as const satisfies readonly [string, string, string, string];

function summaryKey(organizationId: string): string {
	return `v1-migration-summary-${organizationId}`;
}

function readSummary(organizationId: string): MigrationSummary | null {
	const raw = localStorage.getItem(summaryKey(organizationId));
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as StoredEntry;
		return parsed.summary ?? null;
	} catch {
		localStorage.removeItem(summaryKey(organizationId));
		return null;
	}
}

export function V1MigrationSummaryModal() {
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const [summary, setSummary] = useState<MigrationSummary | null>(null);
	const [modalUiState, setModalUiState] = useState<ModalUiState>(
		INITIAL_MODAL_UI_STATE,
	);
	const { page, isTransitioning, expandedSection } = modalUiState;

	useEffect(() => {
		if (!organizationId) {
			setSummary(null);
			setModalUiState(INITIAL_MODAL_UI_STATE);
			return;
		}
		setSummary(readSummary(organizationId));

		const onUpdate = (event: Event) => {
			const detail = (event as CustomEvent<{ organizationId: string }>).detail;
			if (detail?.organizationId === organizationId) {
				setSummary(readSummary(organizationId));
				setModalUiState(INITIAL_MODAL_UI_STATE);
			}
		};
		window.addEventListener(V1_MIGRATION_SUMMARY_EVENT, onUpdate);

		return () => {
			window.removeEventListener(V1_MIGRATION_SUMMARY_EVENT, onUpdate);
		};
	}, [organizationId]);

	const dismiss = () => {
		if (organizationId) localStorage.removeItem(summaryKey(organizationId));
		setSummary(null);
		setModalUiState(INITIAL_MODAL_UI_STATE);
	};

	const transitionToPage = (nextPage: MigrationPage) => {
		if (page === nextPage || isTransitioning) return;
		setModalUiState((current) => ({ ...current, isTransitioning: true }));
		window.setTimeout(() => {
			setModalUiState((current) => ({
				...current,
				page: nextPage,
				isTransitioning: false,
			}));
		}, 160);
	};

	const toggleSection = (section: "projects" | "workspaces" | "errors") => {
		setModalUiState((current) => ({
			...current,
			expandedSection: current.expandedSection === section ? null : section,
		}));
	};

	if (!summary) return null;

	return (
		<Dialog open={!!summary}>
			<DialogContent
				className="!w-[744px] !max-w-[744px] p-0 gap-0 overflow-hidden !rounded-none"
				showCloseButton={false}
				onEscapeKeyDown={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogTitle className="sr-only">
					{page === "welcome"
						? "Welcome to Superset v2"
						: "V1 migration results"}
				</DialogTitle>
				<DialogDescription className="sr-only">
					Review the migration summary and click Done to continue.
				</DialogDescription>

				<div
					className={cn(
						"transition-opacity duration-200 ease-out",
						isTransitioning ? "opacity-0" : "opacity-100",
					)}
				>
					{page === "welcome" ? (
						<WelcomePage />
					) : (
						<ResultsPage
							summary={summary}
							expandedSection={expandedSection}
							onToggleSection={toggleSection}
							onDismiss={dismiss}
						/>
					)}
				</div>

				<div className="box-border flex items-center justify-between border-t bg-background px-5 py-4">
					{page === "results" ? (
						<Button
							variant="outline"
							disabled={isTransitioning}
							onClick={() => transitionToPage("welcome")}
						>
							Back
						</Button>
					) : (
						<div />
					)}
					<Button
						disabled={isTransitioning}
						onClick={() => {
							if (page === "welcome") {
								transitionToPage("results");
							} else {
								dismiss();
							}
						}}
					>
						{page === "welcome" ? "Okay" : "Done"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function WelcomePage() {
	return (
		<div className="relative h-[454px] overflow-hidden bg-[#080a12]">
			<DitheredBackground
				colors={GRADIENT_COLORS}
				className="absolute inset-0 h-full w-full"
			/>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.14),transparent_34%),linear-gradient(to_bottom,rgba(0,0,0,0.04),rgba(0,0,0,0.5))]" />
			<div className="absolute inset-0 flex flex-col items-center justify-center px-14 text-center">
				<div className="text-3xl font-semibold text-white">
					Welcome to Superset v2
				</div>
			</div>
		</div>
	);
}

interface DitheredBackgroundProps {
	colors: readonly [string, string, string, string];
	className?: string;
}

function DitheredBackground({
	colors,
	className = "",
}: DitheredBackgroundProps) {
	return (
		<div
			className={cn(
				"pointer-events-none opacity-40 mix-blend-screen",
				className,
			)}
		>
			<Suspense fallback={null}>
				<Dithering
					colorBack="#00000000"
					colorFront={colors[0]}
					shape="warp"
					type="4x4"
					speed={0.15}
					className="size-full"
					minPixelRatio={1}
				/>
			</Suspense>
		</div>
	);
}

interface ResultsPageProps {
	summary: MigrationSummary;
	expandedSection: "projects" | "workspaces" | "errors" | null;
	onToggleSection: (section: "projects" | "workspaces" | "errors") => void;
	onDismiss: () => void;
}

function ResultsPage({
	summary,
	expandedSection,
	onToggleSection,
	onDismiss,
}: ResultsPageProps) {
	const copyText = electronTrpc.external.copyText.useMutation();
	const [isSendingSupportReport, setIsSendingSupportReport] = useState(false);
	const projectsTotal = summary.projects.filter(
		(project) => project.status !== "error",
	).length;
	const workspacesTotal = summary.workspaces.filter(
		(workspace) => workspace.status !== "error",
	).length;
	const hasErrors = summary.errors.length > 0;
	const projectDetail = [
		countByStatus(summary.projects, "synced", "synced"),
		countByStatus(summary.projects, "linked", "linked"),
		countByStatus(summary.projects, "created", "created"),
	]
		.filter(Boolean)
		.join(" · ");
	const workspaceDetail = [
		countByStatus(summary.workspaces, "synced", "synced"),
		countByStatus(summary.workspaces, "adopted", "adopted"),
		countByStatus(summary.workspaces, "skipped", "skipped"),
	]
		.filter(Boolean)
		.join(" · ");
	const contactSupport = async () => {
		const report = buildMigrationSupportReport(summary);
		setIsSendingSupportReport(true);
		try {
			await apiTrpcClient.support.sendMigrationReport.mutate({ report });
			toast.success("Migration details sent to support");
		} catch (error) {
			console.warn("[v1-migration] Failed to send support report:", error);
			try {
				await copyText.mutateAsync(report);
				toast.success("Migration details copied to clipboard");
			} catch (copyError) {
				console.warn(
					"[v1-migration] Failed to copy support report:",
					copyError,
				);
				toast.error("Could not send migration details");
			}
		} finally {
			setIsSendingSupportReport(false);
		}
	};

	return (
		<div className="flex h-[454px] flex-col bg-background">
			<div className="border-b px-8 py-6">
				<div className="text-2xl font-semibold text-foreground">
					Migration results
				</div>
				<p className="mt-2 text-sm text-muted-foreground">
					Ran into issues?{" "}
					<button
						type="button"
						disabled={isSendingSupportReport || copyText.isPending}
						onClick={() => {
							void contactSupport();
						}}
						className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
					>
						Contact us
					</button>
					. You can go back to V1 in{" "}
					<Link
						to="/settings/experimental"
						onClick={onDismiss}
						className="font-medium text-primary hover:underline"
					>
						settings
					</Link>
					.
				</p>
			</div>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto px-5 py-4">
				<ExpandableSummaryRow
					icon={LuFolder}
					label="Projects"
					count={projectsTotal}
					detail={projectDetail}
					expanded={expandedSection === "projects"}
					onToggle={
						summary.projects.length > 0
							? () => onToggleSection("projects")
							: undefined
					}
				>
					<EntryList>
						{summary.projects.map((p) => (
							<Entry
								key={`project-${p.name}-${p.status}-${p.reason ?? ""}`}
								primary={p.name}
								statusLabel={p.status}
								statusTone={entryTone(p.status)}
								detail={p.reason}
							/>
						))}
					</EntryList>
				</ExpandableSummaryRow>
				<ExpandableSummaryRow
					icon={LuLayoutGrid}
					label="Workspaces"
					count={workspacesTotal}
					detail={workspaceDetail}
					expanded={expandedSection === "workspaces"}
					onToggle={
						summary.workspaces.length > 0
							? () => onToggleSection("workspaces")
							: undefined
					}
				>
					<EntryList>
						{summary.workspaces.map((w) => (
							<Entry
								key={`workspace-${w.name}-${w.branch}-${w.status}-${w.reason ?? ""}`}
								primary={w.name}
								secondary={w.branch}
								statusLabel={w.status}
								statusTone={entryTone(w.status)}
								detail={w.reason}
							/>
						))}
					</EntryList>
				</ExpandableSummaryRow>
				{hasErrors && (
					<ExpandableSummaryRow
						icon={LuTriangle}
						label="Errors"
						count={summary.errors.length}
						detail={summary.errors[0]?.message}
						variant="error"
						expanded={expandedSection === "errors"}
						onToggle={() => onToggleSection("errors")}
					>
						<EntryList>
							{summary.errors.map((error) => (
								<Entry
									key={`error-${error.kind}-${error.name}-${error.message}`}
									primary={error.name}
									secondary={error.kind}
									statusLabel="error"
									statusTone="error"
									detail={error.message}
								/>
							))}
						</EntryList>
					</ExpandableSummaryRow>
				)}
			</div>
		</div>
	);
}

function entryTone(
	status: ProjectStatus | WorkspaceStatus,
): "success" | "muted" | "error" {
	if (status === "error") return "error";
	if (status === "skipped") return "muted";
	return "success";
}

function countByStatus<T extends { status: string }>(
	entries: T[],
	status: T["status"],
	label: string,
): string | null {
	const count = entries.filter((entry) => entry.status === status).length;
	if (count === 0) return null;
	return `${count} ${label}`;
}

function buildMigrationSupportReport(summary: MigrationSummary): string {
	const lines = [
		"Hi Superset team,",
		"",
		"I ran into an issue with the V1 to V2 migration.",
		"",
		"Migration summary:",
		`- Projects: ${summary.projectsCreated} created, ${summary.projectsLinked} linked, ${summary.projectsErrored} errored`,
		`- Workspaces: ${summary.workspacesCreated} created, ${summary.workspacesSkipped} skipped, ${summary.workspacesErrored} errored`,
	];

	const relevantEntries = [
		...summary.errors.map(
			(error) => `${error.kind}: ${error.name} - ${error.message}`,
		),
		...summary.workspaces
			.filter((workspace) => workspace.status === "skipped")
			.map(
				(workspace) =>
					`workspace: ${workspace.name} (${workspace.branch}) - ${workspace.reason ?? workspace.status}`,
			),
	];

	if (relevantEntries.length > 0) {
		lines.push(
			"",
			"Migration errors and skipped items:",
			...relevantEntries
				.slice(0, 20)
				.map((entry) => `- ${truncateSupportLine(entry)}`),
		);
		if (relevantEntries.length > 20) {
			lines.push(`- ${relevantEntries.length - 20} more item(s) not included`);
		}
	}

	return lines.join("\n");
}

function truncateSupportLine(value: string): string {
	if (value.length <= 240) return value;
	return `${value.slice(0, 237)}...`;
}

interface SummaryRowProps {
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	label: string;
	count: number;
	detail?: string;
	variant?: "default" | "error";
}

interface ExpandableSummaryRowProps extends SummaryRowProps {
	expanded: boolean;
	onToggle?: () => void;
	children: React.ReactNode;
}

function ExpandableSummaryRow({
	icon: Icon,
	label,
	count,
	detail,
	variant = "default",
	expanded,
	onToggle,
	children,
}: ExpandableSummaryRowProps) {
	const clickable = onToggle !== undefined;
	return (
		<div className="flex min-w-0 flex-col">
			<button
				type="button"
				disabled={!clickable}
				onClick={onToggle}
				className={cn(
					"flex items-center gap-3 rounded-md px-3 py-2 text-left",
					clickable && "cursor-pointer hover:bg-muted/50",
					!clickable && "cursor-default",
				)}
			>
				<div
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-md",
						variant === "error"
							? "bg-destructive/10 text-destructive"
							: "bg-muted text-foreground",
					)}
				>
					<Icon className="h-4 w-4" strokeWidth={2} />
				</div>
				<div className="flex flex-1 items-center justify-between">
					<div className="flex items-baseline gap-2">
						<span className="text-sm font-medium text-foreground">{label}</span>
						<Badge variant="secondary" className="px-1.5 py-0 text-xs">
							{count}
						</Badge>
					</div>
					<div className="flex items-center gap-2">
						{detail && (
							<span className="max-w-[180px] truncate text-xs text-muted-foreground">
								{detail}
							</span>
						)}
						{clickable &&
							(expanded ? (
								<LuChevronDown
									className="h-3.5 w-3.5 text-muted-foreground"
									strokeWidth={2}
								/>
							) : (
								<LuChevronRight
									className="h-3.5 w-3.5 text-muted-foreground"
									strokeWidth={2}
								/>
							))}
					</div>
				</div>
			</button>
			{expanded && <div className="pb-1 pl-14 pr-3">{children}</div>}
		</div>
	);
}

function EntryList({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-col gap-0.5 py-1">{children}</div>;
}

interface EntryProps {
	primary: string;
	secondary?: string;
	statusLabel: string;
	statusTone: "success" | "muted" | "error";
	detail?: string;
}

function Entry({
	primary,
	secondary,
	statusLabel,
	statusTone,
	detail,
}: EntryProps) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3 py-1">
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-xs font-medium text-foreground">
					{primary}
				</span>
				{secondary && (
					<span className="truncate font-mono text-[10px] text-muted-foreground">
						{secondary}
					</span>
				)}
				{detail && (
					<span className="truncate text-[10px] text-muted-foreground">
						{detail}
					</span>
				)}
			</div>
			<span
				className={cn(
					"shrink-0 text-[10px] font-medium uppercase tracking-wide",
					statusTone === "success" && "text-emerald-600 dark:text-emerald-400",
					statusTone === "muted" && "text-muted-foreground",
					statusTone === "error" && "text-destructive",
				)}
			>
				{statusLabel}
			</span>
		</div>
	);
}
