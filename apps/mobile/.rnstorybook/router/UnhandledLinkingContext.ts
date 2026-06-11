import * as React from "react";

export type StorybookUnhandledLinkingContextValue = {
	lastUnhandledLink: string | undefined;
	setLastUnhandledLink: (lastUnhandledUrl: string | undefined) => void;
};

export const storybookUnhandledLinkingContext: StorybookUnhandledLinkingContextValue =
	{
		lastUnhandledLink: undefined,
		setLastUnhandledLink: () => {},
	};

export const UnhandledLinkingContext =
	React.createContext<StorybookUnhandledLinkingContextValue>(
		storybookUnhandledLinkingContext,
	);

UnhandledLinkingContext.displayName = "UnhandledLinkingContext";
