#!/usr/bin/env node
import { runDesktopAutomationCli } from "./cli/desktop-automation-cli.js";

process.exitCode = await runDesktopAutomationCli();
