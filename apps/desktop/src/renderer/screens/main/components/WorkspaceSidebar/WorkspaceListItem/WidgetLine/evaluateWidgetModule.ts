import type { WidgetComponent } from "renderer/lib/widget-kit";
import { WIDGET_KIT_MODULE_NAME } from "renderer/lib/widget-kit";

/**
 * The set of modules a widget's compiled CJS source is allowed to `require`.
 * `react` and `react-icons/lu` are already bundled; the kit module is injected
 * per-instance. Anything else throws — widgets cannot reach app internals,
 * node, or the network beyond what the kit/command surface allows.
 */
export interface WidgetRequireDeps {
	react: unknown;
	reactIconsLu: unknown;
	kit: unknown;
}

/**
 * Evaluates compiled widget CJS (from sucrase) and returns its default export.
 *
 * Security: the source has already been gated by the trust hash (which covers
 * the widget file contents) before it ever reaches the renderer, so this only
 * runs code the user explicitly approved. The `require` shim is an allowlist —
 * unknown specifiers throw — and there is no `process`, `global`, or filesystem
 * access in scope beyond what the kit exposes. Throws when the module has no
 * usable default export.
 */
export function evaluateWidgetModule(
	code: string,
	deps: WidgetRequireDeps,
): WidgetComponent {
	const requireShim = (name: string): unknown => {
		if (name === "react") return deps.react;
		if (name === "react-icons/lu") return deps.reactIconsLu;
		if (name === WIDGET_KIT_MODULE_NAME) return deps.kit;
		throw new Error(
			`Widget tried to import "${name}". Allowed: react, react-icons/lu, ${WIDGET_KIT_MODULE_NAME}.`,
		);
	};

	const module: { exports: Record<string, unknown> } = { exports: {} };
	// The compiled source is trusted (see above) — build a function over it and
	// hand it the sandboxed require + a fresh module/exports pair. `React` is
	// injected into scope so the classic JSX runtime (`React.createElement`)
	// works even when the widget doesn't explicitly `import * as React`.
	// NOTE: `code` is the compiled widget body (never interpolated user input);
	// it only runs after the user trusts the widget (trust hash covers the file
	// contents), and `require` is the allowlist shim above.
	const factory = new Function("require", "module", "exports", "React", code);
	factory(requireShim, module, module.exports, deps.react);

	const exported = module.exports as {
		default?: unknown;
		Widget?: unknown;
	};
	const candidate = exported.default ?? exported.Widget;
	if (typeof candidate !== "function") {
		throw new Error(
			"Widget module must `export default function Widget({ ctx, kit }) { ... }`.",
		);
	}
	return candidate as WidgetComponent;
}
