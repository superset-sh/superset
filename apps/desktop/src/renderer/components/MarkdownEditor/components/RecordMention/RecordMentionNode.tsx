import { useNavigate } from "@tanstack/react-router";
import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";
import { LuGitPullRequest } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

type MentionKind = "person" | "task" | "pull_request";

const PERSON_PREFIX = "superset://users/";
const TASK_PREFIX = "superset://tasks/";
const PULL_REQUEST_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

function RecordMentionChip({ node }: NodeViewProps) {
	const navigate = useNavigate();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const kind = node.attrs.kind as MentionKind;
	const id = String(node.attrs.id ?? "");
	const label = String(node.attrs.label ?? "");

	const open = () => {
		if (kind === "task") {
			void navigate({ to: "/tasks/$taskId", params: { taskId: id } });
		} else if (kind === "pull_request") {
			openUrl.mutate(id);
		}
	};

	const chipClass =
		"inline-flex max-w-full items-baseline gap-1 rounded-sm bg-fill-hover px-1 align-bottom font-medium text-foreground";

	return (
		<NodeViewWrapper as="span" className="inline">
			{kind === "person" ? (
				<span contentEditable={false} className={chipClass}>
					@{label}
				</span>
			) : (
				<button
					type="button"
					contentEditable={false}
					onClick={open}
					className={`${chipClass} hover:bg-fill-selected`}
				>
					{kind === "task" ? (
						<HiOutlineClipboardDocumentList className="size-3.5 shrink-0 self-center text-muted-foreground" />
					) : (
						<LuGitPullRequest className="size-3.5 shrink-0 self-center text-muted-foreground" />
					)}
					<span className="max-w-[24rem] truncate">{label}</span>
				</button>
			)}
		</NodeViewWrapper>
	);
}

const HTML_ENTITIES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
};

const escapeLabel = (text: string) =>
	text
		.replace(/[\\[\]`*_~]/g, "\\$&")
		.replace(/[&<>]/g, (char) => HTML_ENTITIES[char] ?? char);

/**
 * A person, task, or pull request named in a document. Stored as a markdown link so
 * the text reads plainly anywhere: people and tasks point at superset:// addresses,
 * pull requests at their GitHub page.
 */
export const RecordMentionNode = Node.create({
	name: "record-mention",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			kind: { default: "person" },
			id: { default: null },
			label: { default: "" },
		};
	},

	parseHTML() {
		return [
			{
				tag: `a[href^="${PERSON_PREFIX}"]`,
				priority: 100,
				getAttrs: (element) => ({
					kind: "person",
					id: element.getAttribute("href")?.slice(PERSON_PREFIX.length),
					label: (element.textContent ?? "").replace(/^@/, ""),
				}),
			},
			{
				tag: `a[href^="${TASK_PREFIX}"]`,
				priority: 100,
				getAttrs: (element) => ({
					kind: "task",
					id: element.getAttribute("href")?.slice(TASK_PREFIX.length),
					label: element.textContent ?? "",
				}),
			},
			{
				tag: "a[href]",
				priority: 100,
				getAttrs: (element) => {
					const href = element.getAttribute("href") ?? "";
					const text = element.textContent ?? "";
					if (!PULL_REQUEST_URL.test(href) || !text.startsWith("#")) {
						return false;
					}
					return { kind: "pull_request", id: href, label: text };
				},
			},
		];
	},

	renderHTML({ node, HTMLAttributes }) {
		const kind = node.attrs.kind as MentionKind;
		const href =
			kind === "person"
				? `${PERSON_PREFIX}${node.attrs.id}`
				: kind === "task"
					? `${TASK_PREFIX}${node.attrs.id}`
					: String(node.attrs.id);
		return [
			"a",
			mergeAttributes(HTMLAttributes, { href }),
			kind === "person" ? `@${node.attrs.label}` : node.attrs.label,
		];
	},

	renderText({ node }) {
		return node.attrs.kind === "person"
			? `@${node.attrs.label}`
			: String(node.attrs.label);
	},

	addStorage() {
		return {
			markdown: {
				serialize(
					state: { write: (text: string) => void },
					node: ProseMirrorNode,
				) {
					const kind = node.attrs.kind as MentionKind;
					const label = String(node.attrs.label ?? "");
					const href =
						kind === "person"
							? `${PERSON_PREFIX}${node.attrs.id}`
							: kind === "task"
								? `${TASK_PREFIX}${node.attrs.id}`
								: String(node.attrs.id);
					const text = kind === "person" ? `@${label}` : label;
					state.write(`[${escapeLabel(text)}](${href})`);
				},
				parse: {},
			},
		};
	},

	addNodeView() {
		return ReactNodeViewRenderer(RecordMentionChip);
	},
});
