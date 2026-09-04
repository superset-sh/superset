import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { type ReactNode, useState } from "react";
import { LuFileCode } from "react-icons/lu";
import type { ChangesetFile } from "../../../../../useChangeset";
import { type FileView, resolveViews } from "../../../FilePane/registry";
import { DiffSidePreview } from "./components/DiffSidePreview";

interface BinaryDiffPreviewProps {
	file: ChangesetFile;
	workspaceId: string;
	worktreePath?: string;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
}

/** Views that decode eagerly. Anything else (video, PDF) mounts a player or
 * an iframe per side, so a changeset full of them waits for a click, the way
 * generated files wait behind "Load diff". */
const AUTO_PREVIEW_VIEW_IDS = new Set(["image"]);

/** The registry view that would open this file in a tab, if it can draw
 * bytes. Text views and the binary warning don't count: a font or a sqlite
 * file has nothing to preview. */
function pickBytesView(path: string): FileView | null {
	return (
		resolveViews(path, { isBinary: true }).find(
			(view) => view.priority === "exclusive" && view.documentKind === "bytes",
		) ?? null
	);
}

export function BinaryDiffPreview({
	file,
	workspaceId,
	worktreePath,
	onOpenFile,
}: BinaryDiffPreviewProps) {
	const [requested, setRequested] = useState(false);
	const canOpen = file.status !== "deleted";
	const view = worktreePath ? pickBytesView(file.path) : null;
	const hasOld = file.status !== "added" && file.status !== "untracked";
	const hasNew = file.status !== "deleted";
	const openButton = canOpen ? (
		<Button variant="outline" size="sm" onClick={() => onOpenFile(file.path)}>
			<Trans>Open file</Trans>
		</Button>
	) : null;

	if (!view || !worktreePath) {
		return (
			<Placeholder>
				<p className="cursor-text select-text text-sm">
					<Trans>Binary file hidden</Trans>
				</p>
				{openButton}
			</Placeholder>
		);
	}

	if (!requested && !AUTO_PREVIEW_VIEW_IDS.has(view.id)) {
		return (
			<Placeholder>
				<p className="cursor-text select-text text-sm">
					<Trans>Binary file hidden</Trans>
				</p>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setRequested(true)}
					>
						<Trans>Preview</Trans>
					</Button>
					{openButton}
				</div>
			</Placeholder>
		);
	}

	const sides = [hasOld ? "old" : null, hasNew ? "new" : null].filter(
		(side): side is "old" | "new" => side !== null,
	);
	return (
		<div className="flex flex-col items-center gap-3 bg-muted/30 p-4">
			<div
				className={
					sides.length === 2
						? "grid w-full grid-cols-1 gap-3 lg:grid-cols-2"
						: "grid w-full max-w-3xl grid-cols-1 gap-3"
				}
			>
				{sides.map((side) => (
					<figure
						key={side}
						className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border"
					>
						{sides.length === 2 ? (
							<figcaption className="border-border border-b px-3 py-1 text-muted-foreground text-xs">
								{side === "old" ? <Trans>Before</Trans> : <Trans>After</Trans>}
							</figcaption>
						) : null}
						<div className="h-72">
							<DiffSidePreview
								file={file}
								side={side}
								view={view}
								workspaceId={workspaceId}
								worktreePath={worktreePath}
							/>
						</div>
					</figure>
				))}
			</div>
			{openButton}
		</div>
	);
}

function Placeholder({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 bg-muted/30 py-8 text-muted-foreground">
			<LuFileCode className="size-8" />
			{children}
		</div>
	);
}
