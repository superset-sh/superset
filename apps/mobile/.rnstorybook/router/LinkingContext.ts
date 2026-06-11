import type {
	LinkingOptions,
	ParamListBase,
} from "expo-router/react-navigation";
import * as React from "react";

export const storybookLinkingOptions: LinkingOptions<ParamListBase> = {
	enabled: false,
	prefixes: [],
	config: {
		screens: {
			Storybook: "*",
		},
	},
};

export const storybookLinkingContext = {
	options: storybookLinkingOptions,
};

export const LinkingContext = React.createContext(storybookLinkingContext);

LinkingContext.displayName = "LinkingContext";
