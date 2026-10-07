import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const native =
	process.platform === "darwin" &&
	spawnSync("xcrun", ["--find", "swiftc"]).status === 0;

test.skipIf(!native)(
	"Expo JSI imports through Swift and preserves native scheduler dispatch",
	() => {
		const require = createRequire(join(import.meta.dir, "package.json"));
		const core = createRequire(require.resolve("expo/package.json")).resolve(
			"expo-modules-core/package.json",
		);
		const jsi = createRequire(core).resolve("expo-modules-jsi/package.json");
		const include = join(
			dirname(jsi),
			"apple/Sources/ExpoModulesJSI-Cxx/include",
		);
		const fixture = mkdtempSync(join(tmpdir(), "superset-expo-jsi-proof-"));
		try {
			writeFileSync(
				join(fixture, "module.modulemap"),
				`module ExpoFixture { header ${JSON.stringify(join(include, "RuntimeScheduler.h"))} export * }\n`,
			);
			writeFileSync(
				join(fixture, "proof.swift"),
				"import ExpoFixture\nfunc acceptsScheduler(_ scheduler: expo.RuntimeScheduler) {}\n",
			);
			const imported = spawnSync(
				"xcrun",
				[
					"swiftc",
					"-typecheck",
					"-swift-version",
					"6",
					"-cxx-interoperability-mode=default",
					"-Xcc",
					"-fblocks",
					"-I",
					fixture,
					join(fixture, "proof.swift"),
				],
				{ encoding: "utf8", timeout: 60_000 },
			);
			expect(`${imported.stdout}${imported.stderr}`).toBe("");
			expect(imported.status).toBe(0);
			writeFileSync(
				join(fixture, "proof.cpp"),
				`#include "RuntimeScheduler.h"
#include <cassert>
static void dispatch(void *state, int priority, expo::RuntimeScheduler::ScheduleTaskCallback callback) {
  assert(priority == static_cast<int>(expo::RuntimeScheduler::Priority::NormalPriority));
  ++*static_cast<int *>(state);
  callback();
}
int main() {
  __block int callbacks = 0;
  int dispatches = 0;
  auto *noop = expo::RuntimeScheduler::create();
  assert(!noop->supportsAsyncScheduling());
  noop->scheduleTask(expo::RuntimeScheduler::Priority::NormalPriority, ^{ ++callbacks; });
  noop->retain(); noop->release(); noop->release();
  auto *bound = expo::RuntimeScheduler::create(&dispatches, dispatch);
  assert(bound->supportsAsyncScheduling());
  bound->scheduleTask(expo::RuntimeScheduler::Priority::NormalPriority, ^{ ++callbacks; });
  bound->release();
  assert(callbacks == 2 && dispatches == 1);
}
`,
			);
			const compiler = spawnSync("xcrun", ["--find", "clang++"], {
				encoding: "utf8",
			});
			expect(compiler.status).toBe(0);
			const bridging = join(
				dirname(dirname(compiler.stdout.trim())),
				"include",
			);
			const compiled = spawnSync(
				"xcrun",
				[
					"clang++",
					"-std=c++20",
					"-fblocks",
					"-fsanitize=address",
					"-I",
					include,
					"-I",
					bridging,
					join(fixture, "proof.cpp"),
					"-o",
					join(fixture, "proof"),
				],
				{ encoding: "utf8", timeout: 60_000 },
			);
			expect(`${compiled.stdout}${compiled.stderr}`).toBe("");
			expect(compiled.status).toBe(0);
			const ran = spawnSync(join(fixture, "proof"), [], {
				encoding: "utf8",
				timeout: 5_000,
			});
			expect(`${ran.stdout}${ran.stderr}`).toBe("");
			expect(ran.status).toBe(0);
			writeFileSync(
				join(fixture, "ownership.h"),
				`#include "RuntimeScheduler.h"
int ownershipAllocations();
int ownershipDeallocations();
bool ownershipOwns(expo::RuntimeScheduler *scheduler);
expo::RuntimeScheduler::ScheduleFn ownershipDispatch();
`,
			);
			writeFileSync(
				join(fixture, "module.modulemap"),
				'module ExpoOwnership { header "ownership.h" export * }\n',
			);
			writeFileSync(
				join(fixture, "ownership.cpp"),
				`#include "ownership.h"
#include <cassert>
#include <cstdlib>
#include <new>
static void *owned = nullptr;
static int allocations = 0, deallocations = 0;
void *operator new(std::size_t size) {
  void *pointer = std::malloc(size);
  if (!pointer) throw std::bad_alloc();
  if (size == sizeof(expo::RuntimeScheduler)) {
    assert(owned == nullptr);
    owned = pointer;
    ++allocations;
  }
  return pointer;
}
void operator delete(void *pointer) noexcept {
  if (pointer == owned) { owned = nullptr; ++deallocations; }
  std::free(pointer);
}
int ownershipAllocations() { return allocations; }
int ownershipDeallocations() { return deallocations; }
bool ownershipOwns(expo::RuntimeScheduler *scheduler) { return owned == scheduler; }
static void dispatch(void *, int, expo::RuntimeScheduler::ScheduleTaskCallback callback) { callback(); }
expo::RuntimeScheduler::ScheduleFn ownershipDispatch() { return dispatch; }
`,
			);
			const ownershipCompiled = spawnSync(
				"xcrun",
				[
					"clang++",
					"-std=c++20",
					"-fblocks",
					"-fsanitize=address",
					"-I",
					include,
					"-I",
					bridging,
					"-I",
					fixture,
					"-c",
					join(fixture, "ownership.cpp"),
					"-o",
					join(fixture, "ownership.o"),
				],
				{ encoding: "utf8", timeout: 60_000 },
			);
			expect(`${ownershipCompiled.stdout}${ownershipCompiled.stderr}`).toBe("");
			expect(ownershipCompiled.status).toBe(0);
			writeFileSync(
				join(fixture, "ownership.swift"),
				`import ExpoOwnership
@inline(never) func retainedCopies(bound: Bool) -> [expo.RuntimeScheduler] {
  let scheduler: expo.RuntimeScheduler = bound
    ? expo.RuntimeScheduler.create(nil, ownershipDispatch())
    : expo.RuntimeScheduler.create()
  precondition(ownershipOwns(scheduler))
  return [scheduler, scheduler]
}
@inline(never) func releaseCopies(bound: Bool) {
  var copies = retainedCopies(bound: bound)
  precondition(ownershipOwns(copies[0]))
  precondition(copies[0].supportsAsyncScheduling() == bound)
  copies.removeFirst()
  precondition(copies[0].supportsAsyncScheduling() == bound)
  withExtendedLifetime(copies) {}
  copies.removeAll()
}
for bound in [false, true] {
  releaseCopies(bound: bound)
  precondition(ownershipAllocations() == ownershipDeallocations())
}
precondition(ownershipAllocations() == 2)
print("2 allocations, 2 destructions, Swift copies released")
`,
			);
			for (const optimization of ["-Onone", "-O"]) {
				const ownershipImported = spawnSync(
					"xcrun",
					[
						"swiftc",
						"-swift-version",
						"6",
						"-cxx-interoperability-mode=default",
						"-Xcc",
						"-fblocks",
						"-Xcc",
						"-std=c++20",
						"-sanitize=address",
						optimization,
						"-I",
						include,
						"-I",
						fixture,
						join(fixture, "ownership.swift"),
						join(fixture, "ownership.o"),
						"-o",
						join(fixture, "ownership"),
					],
					{ encoding: "utf8", timeout: 60_000 },
				);
				expect(`${ownershipImported.stdout}${ownershipImported.stderr}`).toBe(
					"",
				);
				expect(ownershipImported.status).toBe(0);
				const ownershipRan = spawnSync(join(fixture, "ownership"), [], {
					encoding: "utf8",
					timeout: 5_000,
				});
				expect(ownershipRan.stdout).toBe(
					"2 allocations, 2 destructions, Swift copies released\n",
				);
				expect(ownershipRan.stderr).toBe("");
				expect(ownershipRan.status).toBe(0);
			}
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	},
	120_000,
);
