export type {
	ClickOptions,
	ClickResult,
	ConsoleLogsOptions,
	DomElement as AutomationDomElement,
	NavigateOptions,
	ScreenshotRect,
	ScreenshotResult,
	SendKeysOptions,
	TypeTextOptions,
	WaitForOptions,
	WaitForResult,
	WindowInfo,
} from "./automation/index.js";
export { DesktopAutomation } from "./automation/index.js";
export { createMcpServer } from "./mcp/index.js";
export type {
	ClickResponse,
	ConsoleLogEntry,
	ConsoleLogsResponse,
	DomElement,
	DomResponse,
	EvaluateResponse,
	NavigateResponse,
	ScreenshotResponse,
	TypeResponse,
	WindowInfoResponse,
} from "./zod.js";
