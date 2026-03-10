import { loadRegistry, validateRegistry } from "./registry/loader";
import { resolveFeatures } from "./resolver/resolver";

const args = process.argv.slice(2);
const atlasPathIdx = args.indexOf("--atlas");
const atlasPath = atlasPathIdx !== -1 ? args[atlasPathIdx + 1] : "/Users/bright/Projects/feature-atlas";

// --atlas 옵션 제거
const featureArgs = atlasPathIdx !== -1
  ? args.filter((_, i) => i !== atlasPathIdx && i !== atlasPathIdx + 1)
  : args;

if (featureArgs.length === 0 || featureArgs.includes("--help")) {
  console.log("Usage: bun run cli.ts [--atlas <path>] <feature1> <feature2> ...");
  console.log("");
  console.log("Examples:");
  console.log("  bun run cli.ts blog payment community");
  console.log("  bun run cli.ts --atlas /path/to/feature-atlas blog");
  console.log("");
  console.log("Options:");
  console.log("  --atlas <path>  Feature Atlas repo path (default: /Users/bright/Projects/feature-atlas)");
  console.log("  --help          Show this help");
  process.exit(0);
}

// 1. Registry 로드 + 검증
console.log(`\nLoading registry from: ${atlasPath}`);
const registry = loadRegistry(atlasPath);
const errors = validateRegistry(registry);

if (errors.length > 0) {
  console.error("\nRegistry validation errors:");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`Registry loaded: ${Object.keys(registry.features).length} features\n`);

// 2. 의존성 해결
try {
  const result = resolveFeatures(registry, featureArgs);

  console.log("Selected features:");
  for (const name of result.selected) {
    const f = registry.features[name];
    console.log(`  + ${name} (${f?.group})`);
  }

  if (result.autoIncluded.length > 0) {
    console.log("\nAuto-included (dependencies + core):");
    for (const name of result.autoIncluded) {
      const f = registry.features[name];
      console.log(`  * ${name} (${f?.group})`);
    }
  }

  console.log(`\nResolved order (${result.resolved.length} features):`);
  for (let i = 0; i < result.resolved.length; i++) {
    const name = result.resolved[i];
    const f = registry.features[name];
    const type = f?.type === "widget" ? " [widget]" : f?.type === "agent" ? " [agent]" : "";
    console.log(`  ${i + 1}. ${name}${type}`);
  }

  if (result.availableOptional.length > 0) {
    console.log("\nAvailable optional features:");
    for (const name of result.availableOptional) {
      const f = registry.features[name];
      console.log(`  ? ${name} - ${f?.description || f?.name}`);
    }
  }

  // Schema tables
  const allTables = result.resolved.flatMap(
    (name) => registry.features[name]?.schema.tables ?? [],
  );
  if (allTables.length > 0) {
    console.log(`\nDatabase tables (${allTables.length}):`);
    for (const table of allTables) {
      console.log(`  - ${table}`);
    }
  }

  // Env vars
  const featureEnvs = new Set<string>();
  for (const name of result.resolved) {
    const f = registry.features[name];
    if (f?.env?.feature) {
      for (const e of f.env.feature) featureEnvs.add(e);
    }
  }
  if (featureEnvs.size > 0) {
    console.log(`\nRequired environment variables:`);
    for (const env of featureEnvs) {
      console.log(`  - ${env}`);
    }
  }
} catch (err) {
  console.error(`\nResolution error: ${(err as Error).message}`);
  process.exit(1);
}
