#!/usr/bin/env bash
set -euo pipefail

module_dir="$(cd "$(dirname "$0")/.." && pwd)"
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/composer-audio-test.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT

xcrun clang -fobjc-arc -fmodules \
  -c "$module_dir/ios/ComposerExceptionGuard.m" \
  -o "$output_dir/ComposerExceptionGuard.o"
xcrun swiftc -parse-as-library \
  -import-objc-header "$module_dir/ios/ComposerExceptionGuard.h" \
  "$module_dir/ios/ComposerAudioRecording.swift" \
  "$module_dir/tests/ComposerAudioRecording.test.swift" \
  "$output_dir/ComposerExceptionGuard.o" \
  -o "$output_dir/audio-recording-test"
"$output_dir/audio-recording-test"
