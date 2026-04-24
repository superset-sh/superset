/**
 * Tool-name → component registry. Adding a new purpose-built renderer
 * is one line. Anything not registered falls through to GenericTool.
 *
 * Names are normalized to lowercase so we match across providers that
 * send different casings (e.g. "Shell" vs "shell").
 *
 * Plan reference: 20260421-v2-chat-opencode-ui-components.md §Tier 1
 * (registry pattern).
 */

import type { ToolPart } from "@superset/chat/shared";
import type { ComponentType } from "react";
import { GenericTool } from "./GenericTool";
import { ApplyPatchTool } from "./tools/ApplyPatchTool";
import { EditTool } from "./tools/EditTool";
import { QuestionTool } from "./tools/QuestionTool";
import { ReadTool } from "./tools/ReadTool";
import { GlobTool, GrepTool, ListTool } from "./tools/SearchTool";
import { ShellTool } from "./tools/ShellTool";
import { TaskTool } from "./tools/TaskTool";
import { TodoTool } from "./tools/TodoTool";
import {
	CodeSearchTool,
	WebFetchTool,
	WebSearchTool,
} from "./tools/WebTool";
import { WriteTool } from "./tools/WriteTool";

export type ToolRenderer = ComponentType<{ part: ToolPart }>;

const REGISTRY: Record<string, ToolRenderer> = {
	// Shell / bash
	shell: ShellTool,
	bash: ShellTool,
	terminal: ShellTool,

	// File mutations
	edit: EditTool,
	str_replace: EditTool,
	str_replace_editor: EditTool,
	write: WriteTool,
	create: WriteTool,

	// File reads / search / list
	read: ReadTool,
	read_file: ReadTool,
	view: ReadTool,
	grep: GrepTool,
	search: GrepTool,
	code_search: GrepTool,
	glob: GlobTool,
	list: ListTool,
	ls: ListTool,
	list_dir: ListTool,

	// Planning / questions
	todo: TodoTool,
	todowrite: TodoTool,
	todo_write: TodoTool,
	question: QuestionTool,
	ask: QuestionTool,

	// Multi-file patches
	apply_patch: ApplyPatchTool,
	applypatch: ApplyPatchTool,
	patch: ApplyPatchTool,

	// Subagents / tasks
	task: TaskTool,
	subagent: TaskTool,
	dispatch_agent: TaskTool,

	// Web / search over external sources
	web_fetch: WebFetchTool,
	webfetch: WebFetchTool,
	fetch: WebFetchTool,
	web_search: WebSearchTool,
	websearch: WebSearchTool,
	code_search_web: CodeSearchTool,
};

/**
 * Look up the renderer for a tool part. Matches are case-insensitive
 * and tolerate a "tool-" prefix if the server/server adapter adds one.
 */
export function getToolRenderer(tool: string): ToolRenderer {
	const key = tool.toLowerCase().replace(/^tool[-_]?/, "");
	return REGISTRY[key] ?? GenericTool;
}
