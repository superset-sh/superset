import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	CircleAlert,
	FileArchive,
	FileText,
	Globe2,
	KeyRound,
	PackageCheck,
	Power,
	Search,
	ShieldCheck,
	TerminalSquare,
	Trash2,
	Upload,
	Users,
	Wrench,
	XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

type CapabilityTypeFilter = "all" | "skill" | "cli";

type CapabilityListItem = Awaited<
	ReturnType<typeof apiTrpcClient.capability.list.query>
>[number];

type CapabilityDetail = Awaited<
	ReturnType<typeof apiTrpcClient.capability.get.query>
>;

type CapabilityVersion = CapabilityDetail["versions"][number];

interface ValidationFile {
	path: string;
	sizeBytes: number;
}

interface DisplayInfo {
	summary?: string;
	overviewMarkdown?: string;
	extractedReadmeMarkdown?: string;
	intendedUsers: string[];
	useCases: string[];
}

interface SkillDetails {
	entryFile: string;
	targets: string[];
	activation?: string;
	categories: string[];
}

interface CliCommandView {
	name: string;
	bin: string;
	title: string;
	description?: string;
	examples: string[];
	commandExamples: string[];
}

interface CliEnvView {
	name: string;
	label: string;
	required: boolean;
	secret: boolean;
	description?: string;
}

interface CliDetails {
	strategy?: string;
	installCommands: string[];
	commands: CliCommandView[];
	env: CliEnvView[];
	network: boolean;
}

interface AuditFindingView {
	severity: string;
	title: string;
	description: string;
	path?: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("Failed to read file"));
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value
				.map((item) => optionalString(item))
				.filter((item): item is string => Boolean(item))
		: [];
}

function boolValue(value: unknown): boolean {
	return typeof value === "boolean" ? value : false;
}

function formatBytes(bytes: number | null | undefined): string {
	if (!bytes || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function filesFromValidationSummary(summary: unknown): ValidationFile[] {
	if (
		!isRecord(summary) ||
		!("files" in summary) ||
		!Array.isArray(summary.files)
	) {
		return [];
	}
	return summary.files
		.map((file): ValidationFile | null => {
			if (!isRecord(file)) return null;
			const pathValue = file.path;
			const sizeValue = file.sizeBytes;
			if (typeof pathValue !== "string" || typeof sizeValue !== "number") {
				return null;
			}
			return { path: pathValue, sizeBytes: sizeValue };
		})
		.filter((file): file is ValidationFile => file !== null);
}

function manifestRecord(
	version: CapabilityVersion | null,
): Record<string, unknown> {
	return version && isRecord(version.manifest) ? version.manifest : {};
}

function validationDisplay(summary: unknown): DisplayInfo {
	const display =
		isRecord(summary) && isRecord(summary.display) ? summary.display : {};

	return {
		summary: optionalString(display.summary),
		overviewMarkdown: optionalString(display.overviewMarkdown),
		extractedReadmeMarkdown: optionalString(display.extractedReadmeMarkdown),
		intendedUsers: stringArray(display.intendedUsers),
		useCases: stringArray(display.useCases),
	};
}

function manifestDisplay(manifest: Record<string, unknown>): DisplayInfo {
	const display = isRecord(manifest.display) ? manifest.display : {};
	return {
		summary: optionalString(display.summary),
		overviewMarkdown: optionalString(display.overviewMarkdown),
		intendedUsers: stringArray(display.intendedUsers),
		useCases: stringArray(display.useCases),
	};
}

function displayInfoForCapability(
	capability: CapabilityDetail,
	version: CapabilityVersion | null,
): DisplayInfo {
	const manifest = manifestRecord(version);
	const fromValidation = validationDisplay(version?.validationSummary ?? null);
	const fromManifest = manifestDisplay(manifest);
	return {
		summary:
			fromValidation.summary ??
			fromManifest.summary ??
			capability.description ??
			optionalString(manifest.description),
		overviewMarkdown:
			fromValidation.overviewMarkdown ??
			fromManifest.overviewMarkdown ??
			fromValidation.extractedReadmeMarkdown,
		extractedReadmeMarkdown: fromValidation.extractedReadmeMarkdown,
		intendedUsers:
			fromValidation.intendedUsers.length > 0
				? fromValidation.intendedUsers
				: fromManifest.intendedUsers,
		useCases:
			fromValidation.useCases.length > 0
				? fromValidation.useCases
				: fromManifest.useCases,
	};
}

function fallbackOverviewMarkdown(
	capability: CapabilityDetail,
	display: DisplayInfo,
) {
	const sections = [`## ${capability.name}`];
	if (display.summary) sections.push(display.summary);
	if (display.useCases.length > 0) {
		sections.push(
			["### Common uses", ...display.useCases.map((item) => `- ${item}`)].join(
				"\n",
			),
		);
	}
	if (display.intendedUsers.length > 0) {
		sections.push(
			[
				"### Good for",
				...display.intendedUsers.map((item) => `- ${item}`),
			].join("\n"),
		);
	}
	return sections.length > 1 ? sections.join("\n\n") : "";
}

function titleFromName(value: string): string {
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
		.join(" ");
}

function skillDetailsFromManifest(
	manifest: Record<string, unknown>,
): SkillDetails {
	const skill = isRecord(manifest.skill) ? manifest.skill : {};
	return {
		entryFile: optionalString(skill.entryFile) ?? "SKILL.md",
		targets: stringArray(skill.targets),
		activation: optionalString(skill.activation),
		categories: stringArray(skill.categories),
	};
}

function cliDetailsFromManifest(manifest: Record<string, unknown>): CliDetails {
	const cli = isRecord(manifest.cli) ? manifest.cli : {};
	const install = isRecord(cli.install) ? cli.install : {};
	const commands = Array.isArray(cli.commands)
		? cli.commands
				.map((command): CliCommandView | null => {
					if (!isRecord(command)) return null;
					const name =
						optionalString(command.name) ??
						optionalString(command.bin) ??
						"command";
					const bin = optionalString(command.bin) ?? name;
					return {
						name,
						bin,
						title: optionalString(command.title) ?? titleFromName(name),
						description: optionalString(command.description),
						examples: stringArray(command.examples),
						commandExamples: stringArray(command.commandExamples),
					};
				})
				.filter((command): command is CliCommandView => command !== null)
		: [];
	const env = Array.isArray(cli.env)
		? cli.env
				.map((item): CliEnvView | null => {
					if (!isRecord(item)) return null;
					const name = optionalString(item.name);
					if (!name) return null;
					return {
						name,
						label: optionalString(item.label) ?? titleFromName(name),
						required: boolValue(item.required),
						secret: boolValue(item.secret),
						description: optionalString(item.description),
					};
				})
				.filter((item): item is CliEnvView => item !== null)
		: [];

	return {
		strategy: optionalString(install.strategy),
		installCommands: stringArray(install.commands),
		commands,
		env,
		network: boolValue(cli.network),
	};
}

function auditFindingsFromVersion(
	version: CapabilityVersion | null,
): AuditFindingView[] {
	return Array.isArray(version?.auditFindings)
		? version.auditFindings
				.map((finding): AuditFindingView | null => {
					if (!isRecord(finding)) return null;
					const title = optionalString(finding.title);
					const description = optionalString(finding.description);
					if (!title || !description) return null;
					return {
						severity: optionalString(finding.severity) ?? "medium",
						title,
						description,
						path: optionalString(finding.path),
					};
				})
				.filter((finding): finding is AuditFindingView => finding !== null)
		: [];
}

function securityBadgeClass(status: string | null | undefined) {
	if (status === "passed") {
		return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
	}
	if (status === "failed") {
		return "border-destructive/30 bg-destructive/10 text-destructive";
	}
	if (status === "pending") {
		return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300";
	}
	return "border-muted-foreground/20 text-muted-foreground";
}

function securityLabel(status: string | null | undefined) {
	if (status === "passed") return "Security passed";
	if (status === "failed") return "Security failed";
	if (status === "pending") return "Security pending";
	return "Security unavailable";
}

function versionLabel(version: CapabilityVersion | null | undefined): string {
	if (!version) return "No active version";
	return version.version;
}

export function ToolsAndSkillsSettings() {
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [typeFilter, setTypeFilter] = useState<CapabilityTypeFilter>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [lastImportMessage, setLastImportMessage] = useState<string | null>(
		null,
	);

	const listQueryKey = useMemo(
		() => ["settings", "capabilities", typeFilter, searchQuery] as const,
		[typeFilter, searchQuery],
	);
	const capabilityListQuery = useQuery({
		queryKey: listQueryKey,
		queryFn: () =>
			apiTrpcClient.capability.list.query({
				...(typeFilter === "all" ? {} : { type: typeFilter }),
				...(searchQuery.trim() ? { query: searchQuery.trim() } : {}),
			}),
	});
	const capabilities = capabilityListQuery.data ?? [];

	useEffect(() => {
		if (
			selectedId &&
			capabilities.some((capability) => capability.id === selectedId)
		) {
			return;
		}
		setSelectedId(capabilities[0]?.id ?? null);
	}, [capabilities, selectedId]);

	const detailQuery = useQuery({
		queryKey: ["settings", "capability", selectedId],
		enabled: Boolean(selectedId),
		queryFn: () => apiTrpcClient.capability.get.query({ id: selectedId ?? "" }),
	});

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["settings", "capabilities"],
		});
		if (selectedId) {
			await queryClient.invalidateQueries({
				queryKey: ["settings", "capability", selectedId],
			});
		}
	};

	const importMutation = useMutation({
		mutationFn: async (file: File) => {
			const fileData = await readFileAsDataUrl(file);
			return apiTrpcClient.capability.importPackage.mutate({
				filename: file.name,
				fileData,
				sourceType: "zip",
			});
		},
		onSuccess: async (result) => {
			setSelectedId(result.capability.id);
			setLastImportMessage(
				`${result.manifest.name} ${result.manifest.version} imported. ${securityLabel(result.audit.status)}.`,
			);
			await invalidate();
		},
		onError: (error) => {
			setLastImportMessage(
				error instanceof Error ? error.message : "Failed to import package.",
			);
		},
	});

	const statusMutation = useMutation({
		mutationFn: (input: { id: string; status: "active" | "disabled" }) =>
			apiTrpcClient.capability.setStatus.mutate(input),
		onSuccess: () => {
			void invalidate();
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => apiTrpcClient.capability.delete.mutate({ id }),
		onSuccess: async () => {
			setSelectedId(null);
			await invalidate();
		},
	});

	const selectedCapability = detailQuery.data ?? null;
	const currentVersion =
		selectedCapability?.versions.find(
			(version) => version.id === selectedCapability.currentVersionId,
		) ??
		selectedCapability?.versions[0] ??
		null;

	return (
		<div className="flex h-full min-h-[calc(100vh-5rem)] flex-col">
			<input
				ref={fileInputRef}
				type="file"
				accept=".zip,application/zip"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) importMutation.mutate(file);
				}}
			/>

			<div className="flex items-center justify-between gap-4 border-b px-6 py-4">
				<div>
					<h1 className="font-semibold text-xl">Tools & Skills</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Reusable Skills and CLI tools for Projects and Automations.
					</p>
				</div>
				<Button
					onClick={() => fileInputRef.current?.click()}
					disabled={importMutation.isPending}
				>
					<Upload className="h-4 w-4" />
					{importMutation.isPending ? "Importing" : "Import zip"}
				</Button>
			</div>

			<div className="flex min-h-0 flex-1">
				<div className="flex w-84 shrink-0 flex-col border-r">
					<div className="space-y-3 border-b p-4">
						<div className="relative">
							<Search className="-translate-y-1/2 absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								placeholder="Search tools and skills"
								className="pl-8"
							/>
						</div>
						<div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
							{(["all", "skill", "cli"] as const).map((filter) => (
								<button
									key={filter}
									type="button"
									onClick={() => setTypeFilter(filter)}
									className={cn(
										"rounded px-2 py-1 text-xs transition-colors",
										typeFilter === filter
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{filter === "all"
										? "All"
										: filter === "skill"
											? "Skills"
											: "CLI"}
								</button>
							))}
						</div>
						{lastImportMessage && (
							<div className="select-text cursor-text rounded border bg-muted/40 p-2 text-muted-foreground text-xs">
								{lastImportMessage}
							</div>
						)}
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{capabilityListQuery.isLoading ? (
							<div className="space-y-2 p-2">
								<div className="h-16 rounded bg-muted" />
								<div className="h-16 rounded bg-muted" />
								<div className="h-16 rounded bg-muted" />
							</div>
						) : capabilities.length === 0 ? (
							<div className="p-6 text-center text-muted-foreground text-sm">
								No tools or skills yet.
							</div>
						) : (
							<div className="space-y-1">
								{capabilities.map((capability) => (
									<CapabilityListRow
										key={capability.id}
										capability={capability}
										isSelected={capability.id === selectedId}
										onSelect={() => setSelectedId(capability.id)}
									/>
								))}
							</div>
						)}
					</div>
				</div>

				<div className="min-w-0 flex-1 overflow-y-auto">
					{selectedCapability ? (
						<CapabilityDetailPanel
							capability={selectedCapability}
							currentVersion={currentVersion}
							onToggleStatus={() =>
								statusMutation.mutate({
									id: selectedCapability.id,
									status:
										selectedCapability.status === "active"
											? "disabled"
											: "active",
								})
							}
							onDelete={() => deleteMutation.mutate(selectedCapability.id)}
							statusPending={statusMutation.isPending}
							deletePending={deleteMutation.isPending}
						/>
					) : (
						<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
							Select a package or import a zip.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function CapabilityDetailPanel({
	capability,
	currentVersion,
	onToggleStatus,
	onDelete,
	statusPending,
	deletePending,
}: {
	capability: CapabilityDetail;
	currentVersion: CapabilityVersion | null;
	onToggleStatus: () => void;
	onDelete: () => void;
	statusPending: boolean;
	deletePending: boolean;
}) {
	const manifest = manifestRecord(currentVersion);
	const display = displayInfoForCapability(capability, currentVersion);
	const overviewMarkdown =
		display.overviewMarkdown ?? fallbackOverviewMarkdown(capability, display);
	const skillDetails = skillDetailsFromManifest(manifest);
	const cliDetails = cliDetailsFromManifest(manifest);
	const files = filesFromValidationSummary(
		currentVersion?.validationSummary ?? null,
	);
	const findings = auditFindingsFromVersion(currentVersion);

	return (
		<div className="space-y-5 p-6">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="truncate font-semibold text-lg">
							{capability.name}
						</h2>
						<TypeBadge type={capability.type} />
						<StatusBadge status={capability.status} />
						<SecurityBadge status={currentVersion?.auditStatus} />
					</div>
					<p className="mt-2 max-w-3xl text-muted-foreground text-sm">
						{display.summary || "No readable summary has been provided yet."}
					</p>
				</div>
				<div className="flex shrink-0 gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={onToggleStatus}
						disabled={statusPending}
					>
						<Power className="h-4 w-4" />
						{capability.status === "active" ? "Disable" : "Enable"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={onDelete}
						disabled={deletePending}
					>
						<Trash2 className="h-4 w-4" />
						Delete
					</Button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-3">
				<Metric label="Current version" value={versionLabel(currentVersion)} />
				<Metric
					label="Used by"
					value={`${capability.usage.projects} projects, ${capability.usage.automations} automations`}
				/>
				<Metric
					label="Works with"
					value={
						capability.type === "skill"
							? skillDetails.targets.join(", ") || "Agent context"
							: "Automation runtime"
					}
				/>
			</div>

			{currentVersion ? (
				<Tabs defaultValue="overview" className="gap-4">
					<TabsList className="h-10 w-full justify-start gap-5 rounded-none border-b bg-transparent p-0">
						<TabTrigger value="overview">Overview</TabTrigger>
						<TabTrigger value="usage">How to use</TabTrigger>
						<TabTrigger value="config">Configuration & permissions</TabTrigger>
						<TabTrigger value="details">Versions & details</TabTrigger>
					</TabsList>

					<TabsContent value="overview" className="mt-0">
						<OverviewTab
							overviewMarkdown={overviewMarkdown}
							display={display}
						/>
					</TabsContent>
					<TabsContent value="usage" className="mt-0">
						<HowToUseTab
							type={capability.type}
							skill={skillDetails}
							cli={cliDetails}
						/>
					</TabsContent>
					<TabsContent value="config" className="mt-0">
						<ConfigurationTab
							type={capability.type}
							cli={cliDetails}
							auditSummary={currentVersion.auditSummary}
							auditStatus={currentVersion.auditStatus}
							findings={findings}
						/>
					</TabsContent>
					<TabsContent value="details" className="mt-0">
						<DetailsTab
							capability={capability}
							version={currentVersion}
							manifest={manifest}
							skill={skillDetails}
							cli={cliDetails}
							files={files}
						/>
					</TabsContent>
				</Tabs>
			) : (
				<div className="rounded border p-4 text-muted-foreground text-sm">
					This package has no activated version. Import a version that passes
					security audit before using it in Projects or Automations.
				</div>
			)}
		</div>
	);
}

function OverviewTab({
	overviewMarkdown,
	display,
}: {
	overviewMarkdown: string;
	display: DisplayInfo;
}) {
	if (!overviewMarkdown) {
		return (
			<div className="rounded border border-dashed px-5 py-8 text-center">
				<FileText className="mx-auto h-7 w-7 text-muted-foreground" />
				<h3 className="mt-3 font-medium text-sm">No overview yet</h3>
				<p className="mt-1 text-muted-foreground text-sm">
					Add display.overviewMarkdown or README.md to make this package easier
					to understand.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<MarkdownRenderer
				content={overviewMarkdown}
				className="h-auto min-h-0 overflow-visible"
			/>
			{display.useCases.length > 0 || display.intendedUsers.length > 0 ? (
				<div className="grid gap-4 md:grid-cols-2">
					<TagGroup
						icon={<PackageCheck className="h-4 w-4" />}
						title="Common uses"
						items={display.useCases}
						empty="No use cases listed."
					/>
					<TagGroup
						icon={<Users className="h-4 w-4" />}
						title="Good for"
						items={display.intendedUsers}
						empty="No audience listed."
					/>
				</div>
			) : null}
		</div>
	);
}

function HowToUseTab({
	type,
	skill,
	cli,
}: {
	type: "skill" | "cli";
	skill: SkillDetails;
	cli: CliDetails;
}) {
	if (type === "skill") {
		return (
			<div className="space-y-4">
				<InfoBlock
					icon={<PackageCheck className="h-4 w-4" />}
					title="When the agent should use it"
					description={
						skill.activation ??
						"Use this Skill when a Project or Automation selects it for the task."
					}
				/>
				<TagGroup
					icon={<Wrench className="h-4 w-4" />}
					title="Supported agents"
					items={skill.targets}
					empty="No specific agent targets listed."
				/>
				<TagGroup
					icon={<FileArchive className="h-4 w-4" />}
					title="Categories"
					items={skill.categories}
					empty="No categories listed."
				/>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{cli.commands.length === 0 ? (
				<div className="rounded border border-dashed px-5 py-8 text-center">
					<TerminalSquare className="mx-auto h-7 w-7 text-muted-foreground" />
					<h3 className="mt-3 font-medium text-sm">No actions listed</h3>
					<p className="mt-1 text-muted-foreground text-sm">
						Add cli.commands to explain what this tool can do.
					</p>
				</div>
			) : (
				<div className="grid gap-3 lg:grid-cols-2">
					{cli.commands.map((command) => (
						<div
							key={`${command.name}-${command.bin}`}
							className="rounded border p-4"
						>
							<div className="flex items-start gap-3">
								<div className="rounded bg-muted p-2">
									<TerminalSquare className="h-4 w-4 text-muted-foreground" />
								</div>
								<div className="min-w-0">
									<h3 className="font-medium text-sm">{command.title}</h3>
									<p className="mt-1 text-muted-foreground text-sm">
										{command.description ?? "No description provided."}
									</p>
								</div>
							</div>
							{command.examples.length > 0 ? (
								<ul className="mt-3 space-y-1 text-sm">
									{command.examples.map((example) => (
										<li key={example} className="flex gap-2">
											<span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
											<span>{example}</span>
										</li>
									))}
								</ul>
							) : null}
							{command.commandExamples.length > 0 ? (
								<details className="mt-3">
									<summary className="cursor-pointer select-none text-muted-foreground text-xs">
										Command examples
									</summary>
									<div className="mt-2 space-y-2">
										{command.commandExamples.map((example) => (
											<code
												key={example}
												className="block overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs"
											>
												{example}
											</code>
										))}
									</div>
								</details>
							) : null}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function ConfigurationTab({
	type,
	cli,
	auditSummary,
	auditStatus,
	findings,
}: {
	type: "skill" | "cli";
	cli: CliDetails;
	auditSummary: string | null;
	auditStatus: string;
	findings: AuditFindingView[];
}) {
	return (
		<div className="space-y-5">
			<div className="grid gap-3 md:grid-cols-3">
				<PermissionPill
					icon={<Globe2 className="h-4 w-4" />}
					label="Network"
					value={type === "cli" && cli.network ? "May connect" : "Not declared"}
				/>
				<PermissionPill
					icon={<KeyRound className="h-4 w-4" />}
					label="Configuration"
					value={
						type === "cli" && cli.env.length > 0
							? `${cli.env.length} item${cli.env.length === 1 ? "" : "s"}`
							: "None required"
					}
				/>
				<PermissionPill
					icon={<ShieldCheck className="h-4 w-4" />}
					label="Security"
					value={securityLabel(auditStatus)}
				/>
			</div>

			{type === "cli" ? (
				<section className="space-y-3">
					<div>
						<h3 className="font-medium text-sm">Required information</h3>
						<p className="mt-1 text-muted-foreground text-sm">
							Secrets are configured outside the package. The archive only
							declares the names it needs.
						</p>
					</div>
					{cli.env.length === 0 ? (
						<div className="rounded border border-dashed p-4 text-muted-foreground text-sm">
							This CLI does not declare any required configuration.
						</div>
					) : (
						<div className="space-y-2">
							{cli.env.map((item) => (
								<div key={item.name} className="rounded border p-3">
									<div className="flex flex-wrap items-center gap-2">
										<h4 className="font-medium text-sm">{item.label}</h4>
										<Badge variant="outline">
											{item.required ? "Required" : "Optional"}
										</Badge>
										{item.secret ? (
											<Badge variant="secondary">Secret</Badge>
										) : null}
									</div>
									<p className="mt-1 text-muted-foreground text-sm">
										{item.description ?? "No description provided."}
									</p>
								</div>
							))}
						</div>
					)}
					<InfoBlock
						icon={<TerminalSquare className="h-4 w-4" />}
						title="Runtime install"
						description="Superset installs this CLI automatically inside each Automation's managed directory and reuses the install when the version and checksum match."
					/>
				</section>
			) : (
				<InfoBlock
					icon={<PackageCheck className="h-4 w-4" />}
					title="Skill configuration"
					description="Skills are selected by Projects or Automations and materialized into the agent's managed context. They do not install executable tools."
				/>
			)}

			{auditStatus !== "passed" || findings.length > 0 ? (
				<section className="space-y-3">
					<div>
						<h3 className="font-medium text-sm">Security check</h3>
						<p className="mt-1 text-muted-foreground text-sm">
							{auditSummary ?? "No security summary available."}
						</p>
					</div>
					{findings.length > 0 ? (
						<div className="space-y-2">
							{findings.map((finding) => (
								<div
									key={`${finding.title}-${finding.path ?? ""}`}
									className="rounded border p-3"
								>
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="outline">{finding.severity}</Badge>
										<h4 className="font-medium text-sm">{finding.title}</h4>
									</div>
									<p className="mt-1 text-muted-foreground text-sm">
										{finding.description}
									</p>
									{finding.path ? (
										<div className="mt-2 font-mono text-muted-foreground text-xs">
											{finding.path}
										</div>
									) : null}
								</div>
							))}
						</div>
					) : null}
				</section>
			) : null}
		</div>
	);
}

function DetailsTab({
	capability,
	version,
	manifest,
	skill,
	cli,
	files,
}: {
	capability: CapabilityDetail;
	version: CapabilityVersion;
	manifest: Record<string, unknown>;
	skill: SkillDetails;
	cli: CliDetails;
	files: ValidationFile[];
}) {
	const keywords = stringArray(manifest.keywords);

	return (
		<div className="space-y-5">
			<MetadataGrid>
				<MetadataItem label="Package ID" value={capability.slug} />
				<MetadataItem label="Version" value={version.version} />
				<MetadataItem label="Source" value={version.sourceType} />
				<MetadataItem
					label="Entry"
					value={optionalString(manifest.entry) ?? "-"}
				/>
				<MetadataItem
					label="Author"
					value={optionalString(manifest.author) ?? "-"}
				/>
				<MetadataItem
					label="License"
					value={optionalString(manifest.license) ?? "-"}
				/>
				<MetadataItem
					label="Homepage"
					value={optionalString(manifest.homepage) ?? "-"}
				/>
				<MetadataItem label="Imported" value={formatDate(version.createdAt)} />
			</MetadataGrid>

			{keywords.length > 0 ? (
				<TagGroup
					icon={<FileArchive className="h-4 w-4" />}
					title="Keywords"
					items={keywords}
					empty="No keywords listed."
				/>
			) : null}

			{capability.type === "skill" ? (
				<MetadataGrid>
					<MetadataItem label="Skill file" value={skill.entryFile} />
					<MetadataItem
						label="Targets"
						value={skill.targets.join(", ") || "-"}
					/>
					<MetadataItem
						label="Categories"
						value={skill.categories.join(", ") || "-"}
					/>
				</MetadataGrid>
			) : (
				<MetadataGrid>
					<MetadataItem label="Install strategy" value={cli.strategy ?? "-"} />
					<MetadataItem
						label="Commands"
						value={
							cli.commands.map((command) => command.name).join(", ") || "-"
						}
					/>
					<MetadataItem
						label="Configuration"
						value={
							cli.env.map((item) => item.name).join(", ") ||
							"No env vars declared"
						}
					/>
				</MetadataGrid>
			)}

			<details className="rounded border">
				<summary className="cursor-pointer select-none px-4 py-3 font-medium text-sm">
					Advanced package data
				</summary>
				<div className="space-y-4 border-t p-4">
					<MetadataGrid>
						<MetadataItem
							label="Checksum"
							value={version.artifactSha256.slice(0, 16)}
						/>
						<MetadataItem
							label="Archive size"
							value={formatBytes(version.artifactSizeBytes)}
						/>
						<MetadataItem label="Artifact" value={version.artifactPathname} />
					</MetadataGrid>

					<div>
						<h3 className="font-medium text-sm">Files</h3>
						<div className="mt-2 max-h-72 overflow-auto rounded border">
							{files.length === 0 ? (
								<div className="p-3 text-muted-foreground text-sm">
									No file summary available.
								</div>
							) : (
								files.slice(0, 80).map((file) => (
									<div
										key={file.path}
										className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0"
									>
										<span className="truncate font-mono text-xs">
											{file.path}
										</span>
										<span className="shrink-0 text-muted-foreground text-xs">
											{formatBytes(file.sizeBytes)}
										</span>
									</div>
								))
							)}
						</div>
					</div>

					<div>
						<h3 className="font-medium text-sm">Raw manifest</h3>
						<pre className="mt-2 max-h-72 overflow-auto rounded border bg-muted/30 p-3 text-xs">
							{JSON.stringify(manifest, null, 2)}
						</pre>
					</div>
				</div>
			</details>
		</div>
	);
}

function CapabilityListRow({
	capability,
	isSelected,
	onSelect,
}: {
	capability: CapabilityListItem;
	isSelected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full rounded-md px-3 py-2.5 text-left transition-colors",
				isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
			)}
		>
			<div className="flex items-center gap-2">
				{capability.type === "cli" ? (
					<Wrench className="h-4 w-4 text-muted-foreground" />
				) : (
					<PackageCheck className="h-4 w-4 text-muted-foreground" />
				)}
				<span className="min-w-0 flex-1 truncate font-medium text-sm">
					{capability.name}
				</span>
				<SecurityBadge status={capability.auditStatus} compact />
			</div>
			<div className="mt-1 truncate text-muted-foreground text-xs">
				{capability.description || "No summary provided."}
			</div>
			<div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
				<span>{capability.currentVersion ?? "No active version"}</span>
				<span>·</span>
				<span>{capability.status}</span>
			</div>
		</button>
	);
}

function TabTrigger({
	value,
	children,
}: {
	value: string;
	children: ReactNode;
}) {
	return (
		<TabsTrigger
			value={value}
			className="h-10 flex-none rounded-none border-0 border-transparent border-b-2 bg-transparent px-0 text-muted-foreground text-sm shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
		>
			{children}
		</TabsTrigger>
	);
}

function TypeBadge({ type }: { type: "skill" | "cli" }) {
	return (
		<Badge variant="secondary">
			{type === "cli" ? (
				<Wrench className="h-3 w-3" />
			) : (
				<FileArchive className="h-3 w-3" />
			)}
			{type === "cli" ? "CLI tool" : "Skill"}
		</Badge>
	);
}

function StatusBadge({ status }: { status: string }) {
	return (
		<Badge variant={status === "active" ? "secondary" : "outline"}>
			{status === "active" ? "Enabled" : "Disabled"}
		</Badge>
	);
}

function SecurityBadge({
	status,
	compact,
}: {
	status: string | null | undefined;
	compact?: boolean;
}) {
	const icon =
		status === "passed" ? (
			<ShieldCheck className="h-3 w-3" />
		) : status === "failed" ? (
			<XCircle className="h-3 w-3" />
		) : (
			<CircleAlert className="h-3 w-3" />
		);
	return (
		<Badge variant="outline" className={securityBadgeClass(status)}>
			{icon}
			{compact ? (status ?? "pending") : securityLabel(status)}
		</Badge>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded border p-3">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="mt-1 truncate font-medium text-sm">{value}</div>
		</div>
	);
}

function TagGroup({
	icon,
	title,
	items,
	empty,
}: {
	icon: ReactNode;
	title: string;
	items: string[];
	empty: string;
}) {
	return (
		<section className="space-y-2">
			<div className="flex items-center gap-2 text-muted-foreground">
				{icon}
				<h3 className="font-medium text-foreground text-sm">{title}</h3>
			</div>
			{items.length === 0 ? (
				<p className="text-muted-foreground text-sm">{empty}</p>
			) : (
				<div className="flex flex-wrap gap-2">
					{items.map((item) => (
						<Badge key={item} variant="outline">
							{item}
						</Badge>
					))}
				</div>
			)}
		</section>
	);
}

function InfoBlock({
	icon,
	title,
	description,
}: {
	icon: ReactNode;
	title: string;
	description: string;
}) {
	return (
		<section className="rounded border p-4">
			<div className="flex items-start gap-3">
				<div className="rounded bg-muted p-2 text-muted-foreground">{icon}</div>
				<div>
					<h3 className="font-medium text-sm">{title}</h3>
					<p className="mt-1 text-muted-foreground text-sm">{description}</p>
				</div>
			</div>
		</section>
	);
}

function PermissionPill({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="rounded border p-3">
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				{icon}
				<span>{label}</span>
			</div>
			<div className="mt-2 font-medium text-sm">{value}</div>
		</div>
	);
}

function MetadataGrid({ children }: { children: ReactNode }) {
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>
	);
}

function MetadataItem({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded border p-3">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="mt-1 truncate font-medium text-sm" title={value}>
				{value}
			</div>
		</div>
	);
}
