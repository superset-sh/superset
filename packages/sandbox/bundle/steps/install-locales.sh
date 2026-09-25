#!/usr/bin/env bash
set -euo pipefail
line="en_US.UTF-8 UTF-8"
grep -qxF "$line" /etc/locale.gen || printf '%s\n' "$line" >> /etc/locale.gen
locale-gen >/dev/null
