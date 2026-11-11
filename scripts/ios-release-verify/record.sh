#!/usr/bin/env bash
# Append one PASS/FAIL row for the iOS release verify job summary.
# RESULTS is the TSV path. A non-PASS status returns 1.

record() {
  local status="$1"
  local name="$2"
  if [ -z "${RESULTS:-}" ]; then
    echo "RESULTS is not set" >&2
    return 1
  fi
  mkdir -p "$(dirname "$RESULTS")"
  printf '%s\t%s\n' "$status" "$name" >> "$RESULTS"
  printf '%s %s\n' "$status" "$name"
  if [ "$status" != "PASS" ]; then
    echo "::error::${name} ${status}"
    return 1
  fi
}
