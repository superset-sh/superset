#!/usr/bin/env node
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { createMcpServer } from "./mcp/index.js";

// Load the monorepo root .env so env vars like DESKTOP_AUTOMATION_PORT are
// available regardless of the working directory the MCP server is spawned from.
config({ path: resolve(import.meta.dirname, "../../../.env") });

const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
