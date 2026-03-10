import { describe, expect, test } from "bun:test";
import { loadRegistry, validateRegistry } from "./registry/loader";
import { resolveFeatures } from "./resolver/resolver";

describe("integration: registry + resolver", () => {
  const ATLAS_PATH = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";

  test("should load real registry and resolve blog with dependencies", () => {
    const registry = loadRegistry(ATLAS_PATH);
    const errors = validateRegistry(registry);
    expect(errors).toEqual([]);

    const result = resolveFeatures(registry, ["blog"]);

    expect(result.selected).toEqual(["blog"]);
    expect(result.resolved).toContain("blog");
    expect(result.resolved).toContain("profile"); // core
    expect(result.resolved.length).toBeGreaterThanOrEqual(2);
  });

  test("should resolve complex selection: blog + payment + community", () => {
    const registry = loadRegistry(ATLAS_PATH);
    const result = resolveFeatures(registry, ["blog", "payment", "community"]);

    expect(result.resolved).toContain("blog");
    expect(result.resolved).toContain("payment");
    expect(result.resolved).toContain("community");
    expect(result.resolved).toContain("profile");

    // 토폴로지 순서: profile이 나머지보다 먼저
    const profileIdx = result.resolved.indexOf("profile");
    const blogIdx = result.resolved.indexOf("blog");
    expect(profileIdx).toBeLessThan(blogIdx);
  });

  test("should list available optional dependencies", () => {
    const registry = loadRegistry(ATLAS_PATH);
    const result = resolveFeatures(registry, ["blog"]);

    // blog의 optional: comment, reaction, bookmark
    expect(result.availableOptional.length).toBeGreaterThan(0);
  });

  test("should handle all features selected", () => {
    const registry = loadRegistry(ATLAS_PATH);
    const allFeatures = Object.keys(registry.features);
    const result = resolveFeatures(registry, allFeatures);

    expect(result.resolved.length).toBe(allFeatures.length);
  });
});
