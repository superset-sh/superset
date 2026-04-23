import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@superset/ui/dialog";
import { MeshGradient } from "@superset/ui/mesh-gradient";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import {
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuFolder,
	LuLayoutGrid,
	LuTriangle,
} from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { V1_MIGRATION_SUMMARY_EVENT } from "renderer/routes/_authenticated/hooks/useMigrateV1DataToV2";
import { MOCK_ORG_ID } from "shared/constants";

type ProjectStatus = "created" | "linked" | "error";
type WorkspaceStatus = "adopted" | "skipped" | "error";

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

const GRADIENT_COLORS = [
	"#3b82f6",
	"#6366f1",
	"#8b5cf6",
	"#1e1b4b",
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
	const [expandedSection, setExpandedSection] = useState<
		"projects" | "workspaces" | null
	>(null);

	useEffect(() => {
		if (!organizationId) {
			setSummary(null);
			return;
		}
		setSummary(readSummary(organizationId));

		const onUpdate = (event: Event) => {
			const detail = (event as CustomEvent<{ organizationId: string }>).detail;
			if (detail?.organizationId === organizationId) {
				setSummary(readSummary(organizationId));
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
		setExpandedSection(null);
	};

	const toggleSection = (section: "projects" | "workspaces") => {
		setExpandedSection((current) => (current === section ? null : section));
	};

	if (!summary) return null;

	const projectsTotal = summary.projectsCreated + summary.projectsLinked;
	const workspacesTotal = summary.workspacesCreated;
	const hasErrors = summary.errors.length > 0;

	return (
		<Dialog open={!!summary}>
			<DialogContent
				className="!w-[480px] !max-w-[480px] p-0 gap-0 overflow-hidden"
				showCloseButton={false}
				onEscapeKeyDown={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogTitle className="sr-only">Welcome to Superset v2</DialogTitle>
				<DialogDescription className="sr-only">
					We imported your v1 data. Review the summary and click Got it to
					continue.
				</DialogDescription>
				<div className="relative h-[180px] overflow-hidden">
					<MeshGradient
						colors={GRADIENT_COLORS}
						className="absolute inset-0 w-full h-full"
					/>
					<div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
						<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
							<LuCheck className="h-5 w-5 text-white" strokeWidth={2.5} />
						</div>
						<div className="text-xl font-semibold text-white">
							Welcome to Superset v2
						</div>
						<div className="mt-1 text-sm text-white/80">
							We imported your v1 data
						</div>
					</div>
				</div>

				<div className="flex max-h-[340px] flex-col gap-1 overflow-y-auto px-3 py-3">
					<ExpandableSummaryRow
						icon={LuFolder}
						label="Projects"
						count={projectsTotal}
						detail={[
							summary.projectsLinked > 0
								? `${summary.projectsLinked} linked`
								: null,
							summary.projectsCreated > 0
								? `${summary.projectsCreated} created`
								: null,
						]
							.filter(Boolean)
							.join(" · ")}
						expanded={expandedSection === "projects"}
						onToggle={
							summary.projects.length > 0
								? () => toggleSection("projects")
								: undefined
						}
					>
						<EntryList>
							{summary.projects.map((p, index) => (
								<Entry
									key={`project-${index}-${p.name}`}
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
						detail={
							summary.workspacesSkipped > 0
								? `${summary.workspacesSkipped} skipped`
								: undefined
						}
						expanded={expandedSection === "workspaces"}
						onToggle={
							summary.workspaces.length > 0
								? () => toggleSection("workspaces")
								: undefined
						}
					>
						<EntryList>
							{summary.workspaces.map((w, index) => (
								<Entry
									key={`workspace-${index}-${w.name}-${w.branch}`}
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
						<SummaryRow
							icon={LuTriangle}
							label="Errors"
							count={summary.errors.length}
							detail="Details in devtools console"
							variant="error"
						/>
					)}
				</div>

				<div className="flex items-center justify-between border-t bg-background px-5 py-4">
					<span className="text-xs text-muted-foreground">
						v1 data is preserved
					</span>
					<Button onClick={dismiss}>Got it</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function entryTone(
	status: ProjectStatus | WorkspaceStatus,
): "success" | "muted" | "error" {
	if (status === "error") return "error";
	if (status === "skipped") return "muted";
	return "success";
}

interface SummaryRowProps {
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	label: string;
	count: number;
	detail?: string;
	variant?: "default" | "error";
}

function SummaryRow({
	icon: Icon,
	label,
	count,
	detail,
	variant = "default",
}: SummaryRowProps) {
	return (
		<div className="flex items-center gap-3 rounded-md px-3 py-2">
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
				{detail && (
					<span className="text-xs text-muted-foreground">{detail}</span>
				)}
			</div>
		</div>
	);
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
	expanded,
	onToggle,
	children,
}: ExpandableSummaryRowProps) {
	const clickable = onToggle !== undefined;
	return (
		<div className="flex flex-col">
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
				<div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground">
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
							<span className="text-xs text-muted-foreground">{detail}</span>
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
		<div className="flex items-center justify-between gap-3 py-1">
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
