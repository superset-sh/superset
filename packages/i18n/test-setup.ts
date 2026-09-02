// Lingui macros are compile-time only; bun test runs uncompiled source, where
// the macro entry points require babel-plugin-macros and throw. This shim does
// what the macro does: derive the message id from the text, so tests that
// load a real catalog get real translations. Other packages preload it too.
import "../../scripts/test-preload.ts";
import { mock } from "bun:test";
import { i18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";

type MacroDescriptor = {
	message: string;
	context?: string;
	values?: Record<string, unknown>;
};

const compile = ({ message, context, values }: MacroDescriptor) => ({
	id: generateMessageId(message, context),
	message,
	values,
});

mock.module("@lingui/core/macro", () => ({
	msg: (descriptor: MacroDescriptor) => compile(descriptor),
	t: (descriptor: MacroDescriptor) => i18n._(compile(descriptor)),
}));
