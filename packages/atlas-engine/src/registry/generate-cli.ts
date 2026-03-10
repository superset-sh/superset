import { buildRegistryFromScan } from "./scanner";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const atlasPath = process.argv[2];
if (!atlasPath) {
  console.error("Usage: bun run generate-cli.ts <feature-atlas-path>");
  process.exit(1);
}

console.log(`Scanning Feature Atlas at: ${atlasPath}`);
const registry = buildRegistryFromScan(atlasPath);

const featureCount = Object.keys(registry.features).length;
console.log(`Found ${featureCount} features`);

// Feature Atlas 레포의 registry/ 디렉토리에 저장
const outputDir = join(atlasPath, "registry");
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const outputPath = join(outputDir, "features.json");
writeFileSync(outputPath, JSON.stringify(registry, null, 2) + "\n");
console.log(`Registry saved to: ${outputPath}`);

// 요약 출력
for (const [group, meta] of Object.entries(registry.groups)) {
  const count = Object.values(registry.features).filter((f) => f.group === group).length;
  console.log(`  ${meta.label}: ${count} features`);
}
