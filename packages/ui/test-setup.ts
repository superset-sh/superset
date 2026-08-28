/**
 * Bun test setup for @superset/ui.
 *
 * Lingui macros (`@lingui/react/macro`, `@lingui/core/macro`) are compile-time
 * only — the app builds run the Babel/SWC plugin, but `bun test` executes the
 * uncompiled source, where those entry points require `babel-plugin-macros`
 * and throw. These shims render descriptors to their English default so
 * component tests keep asserting the source copy. Mirrors
 * `apps/desktop/test-setup.ts`.
 */
import { mock } from "bun:test";

type MessageDescriptor = {
	id: string;
	message?: string;
	values?: Record<string, unknown>;
};

const renderMessage = (descriptor: MessageDescriptor): string => {
	let text = descriptor.message ?? descriptor.id;
	for (const [key, value] of Object.entries(descriptor.values ?? {})) {
		text = text.replaceAll(`{${key}}`, String(value));
	}
	return text;
};

const pickPluralBranch = (
	value: number,
	branches: Record<string, unknown>,
): unknown => {
	const branch =
		value === 1 && branches.one !== undefined ? branches.one : branches.other;
	return typeof branch === "string"
		? branch.replaceAll("#", String(value))
		: branch;
};

mock.module("@lingui/react/macro", () => ({
	Trans: ({ children }: { children?: unknown }) => children,
	Plural: ({ value, ...branches }: { value: number }) =>
		pickPluralBranch(value, branches),
	Select: ({ value, ...branches }: { value: string }) =>
		(branches as Record<string, unknown>)[value] ??
		(branches as Record<string, unknown>).other,
	SelectOrdinal: ({ value, ...branches }: { value: number }) =>
		pickPluralBranch(value, branches),
	useLingui: () => ({
		t: (descriptor: MessageDescriptor) => renderMessage(descriptor),
		i18n: { _: (descriptor: MessageDescriptor) => renderMessage(descriptor) },
	}),
}));

mock.module("@lingui/core/macro", () => ({
	msg: (descriptor: MessageDescriptor) => descriptor,
	t: (descriptor: MessageDescriptor) => renderMessage(descriptor),
	plural: (value: number, branches: Record<string, string>) =>
		String(pickPluralBranch(value, branches)),
}));
