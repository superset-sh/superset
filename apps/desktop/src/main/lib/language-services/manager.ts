import { languageDiagnosticsStore } from "./diagnostics-store";
import { CssLanguageProvider } from "./providers/css/CssLanguageProvider";
import { DartLanguageProvider } from "./providers/dart/DartLanguageProvider";
import { DockerfileLanguageProvider } from "./providers/dockerfile/DockerfileLanguageProvider";
import { GoLanguageProvider } from "./providers/go/GoLanguageProvider";
import { GraphqlLanguageProvider } from "./providers/graphql/GraphqlLanguageProvider";
import { HtmlLanguageProvider } from "./providers/html/HtmlLanguageProvider";
import { JsonLanguageProvider } from "./providers/json/JsonLanguageProvider";
import { PythonLanguageProvider } from "./providers/python/PythonLanguageProvider";
import { RustLanguageProvider } from "./providers/rust/RustLanguageProvider";
import { TomlLanguageProvider } from "./providers/toml/TomlLanguageProvider";
import { TypeScriptLanguageProvider } from "./providers/typescript/TypeScriptLanguageProvider";
import { YamlLanguageProvider } from "./providers/yaml/YamlLanguageProvider";
import type {
	LanguageServiceCallHierarchyItem,
	LanguageServiceDocument,
	LanguageServiceHover,
	LanguageServiceIncomingCall,
	LanguageServiceLocation,
	LanguageServiceProvider,
	LanguageServiceProviderDescriptor,
	LanguageServiceWorkspaceSnapshot,
} from "./types";

export class LanguageServiceManager {
	private readonly providers: LanguageServiceProvider[] = [
		new TypeScriptLanguageProvider(),
		new JsonLanguageProvider(),
		new YamlLanguageProvider(),
		new HtmlLanguageProvider(),
		new CssLanguageProvider(),
		new TomlLanguageProvider(),
		new DartLanguageProvider(),
		new PythonLanguageProvider(),
		new GoLanguageProvider(),
		new RustLanguageProvider(),
		new DockerfileLanguageProvider(),
		new GraphqlLanguageProvider(),
	];

	private readonly enabledProviders = new Map<string, boolean>(
		this.providers.map((provider) => [provider.id, true] as const),
	);

	private readonly knownWorkspaces = new Map<string, string>();

	async syncDocument(document: LanguageServiceDocument): Promise<void> {
		this.rememberWorkspace(document.workspaceId, document.workspacePath);
		const provider = this.resolveProvider(document.languageId);
		if (!provider || !this.isProviderEnabled(provider.id)) {
			return;
		}

		await provider.changeDocument(document);
	}

	async openDocument(document: LanguageServiceDocument): Promise<void> {
		this.rememberWorkspace(document.workspaceId, document.workspacePath);
		const provider = this.resolveProvider(document.languageId);
		if (!provider || !this.isProviderEnabled(provider.id)) {
			return;
		}

		await provider.openDocument(document);
	}

	async closeDocument(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		languageId: string;
	}): Promise<void> {
		const provider = this.resolveProvider(args.languageId);
		if (!provider) {
			return;
		}

		await provider.closeDocument(args);
	}

	async refreshWorkspace(args: {
		workspaceId: string;
		workspacePath: string;
	}): Promise<void> {
		this.rememberWorkspace(args.workspaceId, args.workspacePath);
		await Promise.all(
			this.providers
				.filter((provider) => this.isProviderEnabled(provider.id))
				.map((provider) => provider.refreshWorkspace(args)),
		);
	}

	async disposeWorkspace(args: {
		workspaceId: string;
		workspacePath: string;
	}): Promise<void> {
		this.knownWorkspaces.delete(args.workspaceId);
		await Promise.all(
			this.providers.map((provider) => provider.disposeWorkspace(args)),
		);
		languageDiagnosticsStore.clearWorkspace(args.workspaceId);
	}

	getWorkspaceSnapshot(args: {
		workspaceId: string;
		workspacePath: string;
	}): LanguageServiceWorkspaceSnapshot {
		this.rememberWorkspace(args.workspaceId, args.workspacePath);
		return languageDiagnosticsStore.createSnapshot({
			workspaceId: args.workspaceId,
			workspacePath: args.workspacePath,
			providers: this.providers.map((provider) =>
				provider.getWorkspaceSummary({
					workspaceId: args.workspaceId,
					workspacePath: args.workspacePath,
					enabled: this.isProviderEnabled(provider.id),
				}),
			),
		});
	}

	getProviders(): LanguageServiceProviderDescriptor[] {
		return this.providers.map((provider) => ({
			providerId: provider.id,
			label: provider.label,
			description: provider.description,
			languageIds: provider.languageIds,
			enabled: this.isProviderEnabled(provider.id),
		}));
	}

	async setProviderEnabled(
		providerId: string,
		enabled: boolean,
	): Promise<LanguageServiceProviderDescriptor | null> {
		const provider = this.providers.find(
			(candidate) => candidate.id === providerId,
		);
		if (!provider) {
			return null;
		}

		const previous = this.isProviderEnabled(providerId);
		if (previous === enabled) {
			return {
				providerId: provider.id,
				label: provider.label,
				description: provider.description,
				languageIds: provider.languageIds,
				enabled,
			};
		}

		this.enabledProviders.set(providerId, enabled);

		if (!enabled) {
			await Promise.all(
				Array.from(this.knownWorkspaces.entries()).map(
					async ([workspaceId, workspacePath]) => {
						await provider.disposeWorkspace({
							workspaceId,
							workspacePath,
						});
					},
				),
			);
			languageDiagnosticsStore.clearProviderDiagnostics(providerId);
		}

		return {
			providerId: provider.id,
			label: provider.label,
			description: provider.description,
			languageIds: provider.languageIds,
			enabled,
		};
	}

	subscribeToWorkspace(
		workspaceId: string,
		listener: (payload: { version: number }) => void,
	) {
		return languageDiagnosticsStore.subscribe(workspaceId, listener);
	}

	async findReferences(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		languageId: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceLocation[] | null> {
		const provider = this.resolveProvider(args.languageId);
		if (!provider || !this.isProviderEnabled(provider.id)) return null;
		return (await provider.findReferences?.(args)) ?? null;
	}

	async getHover(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		languageId: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceHover | null> {
		const provider = this.resolveProvider(args.languageId);
		if (!provider || !this.isProviderEnabled(provider.id)) return null;
		return (await provider.getHover?.(args)) ?? null;
	}

	async getDefinition(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		languageId: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceLocation[] | null> {
		const provider = this.resolveProvider(args.languageId);
		if (!provider || !this.isProviderEnabled(provider.id)) return null;
		return (await provider.getDefinition?.(args)) ?? null;
	}

	async prepareCallHierarchy(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		languageId: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceCallHierarchyItem[] | null> {
		const provider = this.resolveProvider(args.languageId);
		if (!provider || !this.isProviderEnabled(provider.id)) return null;
		return (await provider.prepareCallHierarchy?.(args)) ?? null;
	}

	async getIncomingCalls(args: {
		workspaceId: string;
		languageId: string;
		item: LanguageServiceCallHierarchyItem;
	}): Promise<LanguageServiceIncomingCall[] | null> {
		const provider = this.resolveProvider(args.languageId);
		if (!provider || !this.isProviderEnabled(provider.id)) return null;
		return (
			(await provider.getIncomingCalls?.({
				workspaceId: args.workspaceId,
				item: args.item,
			})) ?? null
		);
	}

	private isProviderEnabled(providerId: string): boolean {
		return this.enabledProviders.get(providerId) ?? false;
	}

	private rememberWorkspace(workspaceId: string, workspacePath: string): void {
		this.knownWorkspaces.set(workspaceId, workspacePath);
	}

	private resolveProvider(languageId: string): LanguageServiceProvider | null {
		return (
			this.providers.find((provider) =>
				provider.supportsLanguage(languageId),
			) ?? null
		);
	}
}

export const languageServiceManager = new LanguageServiceManager();
