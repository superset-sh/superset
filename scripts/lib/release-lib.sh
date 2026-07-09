#!/usr/bin/env bash

# Shared release primitives — SOURCE this file, do not execute it.
#
# Single source of truth for (a) which packages track the desktop version and
# (b) how versions are written and checked. Consumed by:
#   - scripts/release.sh            (the one entry point)
#   - apps/desktop/create-release.sh (desktop flow)
#   - scripts/bump-cli.sh           (interim CLI flow)
#   - scripts/check-versions.sh     (CI guard)
#
# Add a package to UNIFIED_PACKAGES here and every flow + the CI check follows,
# so the bundle can't drift. See plans/20260709-unified-version-bumping.md.

# Desktop is the ceiling (a plain MAJOR.MINOR.PATCH release) and is NOT listed
# below. pty-daemon is intentionally excluded (its own 0.x track).
DESKTOP_PACKAGE="apps/desktop"
UNIFIED_PACKAGES=(packages/host-service packages/cli)

pkg_version() { jq -r .version "$1/package.json"; }

# set_pkg_version <repo_root> <pkg-path> <version> — write + format one package.
set_pkg_version() {
  local repo_root="$1" pkg="$2" version="$3"
  local file="${repo_root}/${pkg}/package.json" tmp
  tmp=$(mktemp)
  jq ".version = \"${version}\"" "${file}" >"${tmp}" && mv "${tmp}" "${file}"
  (cd "${repo_root}" && bunx biome format --write "${pkg}/package.json" >/dev/null)
}

# sync_unified_versions <repo_root> <version> — set every UNIFIED_PACKAGES entry.
sync_unified_versions() {
  local repo_root="$1" version="$2" pkg
  for pkg in "${UNIFIED_PACKAGES[@]}"; do
    set_pkg_version "${repo_root}" "${pkg}" "${version}"
  done
}

# refresh_lockfile <repo_root> — keep bun.lock's workspace versions consistent
# so `--frozen` CI installs don't fail on drift.
refresh_lockfile() {
  local repo_root="$1"
  (cd "${repo_root}" && bun install --lockfile-only >/dev/null 2>&1 || true)
}

increment_patch() {
  local a b c
  IFS='.' read -r a b c <<<"$1"
  echo "${a}.${b}.$((c + 1))"
}
increment_minor() {
  local a b c
  IFS='.' read -r a b c <<<"$1"
  echo "${a}.$((b + 1)).0"
}
increment_major() {
  local a b c
  IFS='.' read -r a b c <<<"$1"
  echo "$((a + 1)).0.0"
}

# assert_unified <repo_root> — verify UNIFIED_PACKAGES share the desktop base
# (never above desktop) and equal each other. Prints each failure; returns 1 on
# drift, 0 when unified.
assert_unified() {
  local repo_root="$1" desktop base fail=0 pkg v first=""
  desktop=$(pkg_version "${repo_root}/${DESKTOP_PACKAGE}")
  if ! [[ "$desktop" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "  ✗ desktop version '${desktop}' is not a plain MAJOR.MINOR.PATCH release"
    fail=1
  fi
  for pkg in "${UNIFIED_PACKAGES[@]}"; do
    v=$(pkg_version "${repo_root}/${pkg}")
    base="${v%%-*}"
    [ "$base" = "$desktop" ] || {
      echo "  ✗ ${pkg} '${v}' base != desktop '${desktop}'"
      fail=1
    }
    if [ -z "$first" ]; then
      first="$v"
    elif [ "$v" != "$first" ]; then
      echo "  ✗ ${pkg} '${v}' != '${first}' (unified packages must match)"
      fail=1
    fi
  done
  return "$fail"
}
