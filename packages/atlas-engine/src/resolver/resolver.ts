import type { FeatureRegistry } from "../registry/types";
import type { ResolvedFeatures, ResolutionError } from "./types";

/**
 * Feature 의존성 해결
 *
 * 1. core features 자동 포함
 * 2. 선택된 features의 dependencies 재귀 탐색
 * 3. 순환 의존성 감지
 * 4. 토폴로지 정렬로 설치 순서 결정
 * 5. optional dependencies 중 사용 가능한 목록 반환
 */
export function resolveFeatures(
  registry: FeatureRegistry,
  selected: string[],
): ResolvedFeatures {
  const allFeatures = registry.features;
  const requiredSet = new Set<string>();
  const autoIncluded = new Set<string>();

  // 1. Core features 자동 포함
  for (const core of registry.core) {
    if (allFeatures[core]) {
      requiredSet.add(core);
      autoIncluded.add(core);
    }
  }

  // 2. 선택된 features 추가
  for (const name of selected) {
    requiredSet.add(name);
  }

  // 3. Dependencies 재귀 탐색
  const visited = new Set<string>();
  const visiting = new Set<string>(); // 순환 감지용

  function resolveDeps(name: string, path: string[]): void {
    if (visited.has(name)) return;

    // 순환 감지
    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name);
      const cycle = [...path.slice(cycleStart), name];
      const error: ResolutionError = {
        type: "circular_dependency",
        message: `Circular dependency detected: ${cycle.join(" -> ")}`,
        cycle,
      };
      throw new Error(`circular_dependency: ${error.message}`);
    }

    // Feature 존재 확인
    if (!allFeatures[name]) {
      const requiredBy = path.length > 0 ? path[path.length - 1] : "user";
      const error: ResolutionError = {
        type: "missing_dependency",
        message: `Feature "${name}" not found (required by "${requiredBy}")`,
        missing: name,
        requiredBy,
      };
      throw new Error(`missing_dependency: ${error.message}`);
    }

    visiting.add(name);

    // 재귀 탐색
    for (const dep of allFeatures[name].dependencies) {
      requiredSet.add(dep);
      if (!selected.includes(dep)) {
        autoIncluded.add(dep);
      }
      resolveDeps(dep, [...path, name]);
    }

    visiting.delete(name);
    visited.add(name);
  }

  // 모든 required features의 의존성 해결
  for (const name of [...requiredSet]) {
    resolveDeps(name, []);
  }

  // 4. 토폴로지 정렬 (Kahn's algorithm)
  const sorted = topologicalSort(requiredSet, allFeatures);

  // 5. Optional dependencies 수집
  const availableOptional = new Set<string>();
  for (const name of requiredSet) {
    const feature = allFeatures[name];
    if (!feature) continue;
    for (const opt of feature.optionalDependencies) {
      if (!requiredSet.has(opt) && allFeatures[opt]) {
        availableOptional.add(opt);
      }
    }
  }

  return {
    selected,
    autoIncluded: [...autoIncluded],
    resolved: sorted,
    availableOptional: [...availableOptional],
  };
}

/** Kahn's algorithm을 사용한 토폴로지 정렬 */
function topologicalSort(
  featureSet: Set<string>,
  allFeatures: Record<string, { dependencies: string[] }>,
): string[] {
  // 그래프 내 in-degree 계산
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const name of featureSet) {
    if (!inDegree.has(name)) inDegree.set(name, 0);
    if (!adjList.has(name)) adjList.set(name, []);
  }

  for (const name of featureSet) {
    const feature = allFeatures[name];
    if (!feature) continue;

    for (const dep of feature.dependencies) {
      if (featureSet.has(dep)) {
        adjList.get(dep)!.push(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }
    }
  }

  // BFS
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  // 안정적 순서를 위해 정렬
  queue.sort();

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjList.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        // 삽입 정렬로 안정적 순서 유지
        const insertIdx = queue.findIndex((q) => q > neighbor);
        if (insertIdx === -1) queue.push(neighbor);
        else queue.splice(insertIdx, 0, neighbor);
      }
    }
  }

  return sorted;
}
