#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import meow from "meow";
import App from "./app.js";

const cli = meow(
	`
		Usage
		  $ cli

		Options
			--name  Your name

		Examples
		  $ cli --name=Jane
		  Hello, Jane
	`,
	{
		importMeta: import.meta,
		flags: {
			name: {
				type: "string",
			},
		},
	},
);

render(<App name={cli.flags.name} />);
