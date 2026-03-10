import { describe, expect, test } from "bun:test";
import { loadRegistry, validateRegistry } from "./loader";

describe("loadRegistry", () => {
  test("should load registry from Feature Atlas path", () => {
    const atlasPath = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";
    const registry = loadRegistry(atlasPath);

    expect(registry.version).toBe("1.0.0");
    expect(Object.keys(registry.features).length).toBeGreaterThan(25);
  });

  test("should throw for invalid path", () => {
    expect(() => loadRegistry("/nonexistent/path")).toThrow();
  });
});

describe("validateRegistry", () => {
  test("should pass for valid registry", () => {
    const atlasPath = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";
    const registry = loadRegistry(atlasPath);
    const errors = validateRegistry(registry);

    expect(errors).toEqual([]);
  });

  test("should detect missing dependency references", () => {
    const atlasPath = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";
    const registry = loadRegistry(atlasPath);
    // 의존성이 존재하지 않는 feature를 추가
    registry.features["broken"] = {
      ...registry.features["blog"],
      name: "broken",
      dependencies: ["nonexistent-feature"],
    };

    const errors = validateRegistry(registry);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("nonexistent-feature");
  });
});
