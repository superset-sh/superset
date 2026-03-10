#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { addCommand } from "./commands/add.js";
import { createCommand } from "./commands/create.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { removeCommand } from "./commands/remove.js";

const program = new Command();

program
  .name("atlas")
  .description("Atlas CLI - Feature installation and project management")
  .version("0.0.1");

// atlas init <project-name>
program
  .command("init <project-name>")
  .description("Create a new Atlas project")
  .option("-t, --template <template>", "Project template (minimal, starter, full)", "starter")
  .option("-f, --features <features>", "Comma-separated list of features to include")
  .action(initCommand);

// atlas create <feature-name>
program
  .command("create <feature-name>")
  .description("Create a new feature (scaffolding)")
  .action(createCommand);

// atlas add <feature...>
program
  .command("add <features...>")
  .description("Add features to the current project")
  .action(addCommand);

// atlas list
program.command("list").description("List available and installed features").action(listCommand);

// atlas remove <feature>
program
  .command("remove <feature>")
  .description("Remove a feature from the project")
  .action(removeCommand);

program.parse();
