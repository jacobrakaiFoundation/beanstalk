#!/usr/bin/env python3
"""Render the iOS release verify job summary. Missing items are FAIL."""

from __future__ import annotations

import sys
from pathlib import Path

REQUIRED = (
    ("checkout-github-sha", "Checked out `github.sha`"),
    ("toolchain-xcode-26", "macOS 26 runner has Xcode 26 or later"),
    ("unsigned-archive", "Unsigned `xcodebuild archive` (`CODE_SIGNING_ALLOWED=NO`)"),
    ("archive-zip-sha-version", "Archive zip, app binary sha256, and version strings"),
    ("entitlements-no-aps-environment", "Entitlements contain no `aps-environment`"),
    ("source-no-registerForRemoteNotifications", "`registerForRemoteNotifications` absent from iOS source"),
    ("simulator-launch-diagnostics", "Simulator launch with `SIMCTL_CHILD_CFNETWORK_DIAGNOSTICS=3`"),
    ("url-positive-control", "Positive control `api.fda.gov/food/enforcement.json` on `url:` lines"),
    ("url-zero-v1-devices", "Zero `/v1/devices` on `url:` lines"),
    ("url-zero-jacobrakai-org", "Zero `jacobrakai.org` on `url:` lines"),
    ("url-zero-PUT", "Zero `PUT` on `url:` lines"),
    ("screenshot-recall-list", "Screenshot of the recall list"),
    ("screenshot-recall-detail", "Screenshot of a recall detail"),
    ("screenshot-settings-disclaimer", "Screenshot of the Settings disclaimer"),
    ("screenshot-sha256-distinct", "Three screenshot sha256 values are distinct"),
)


def parse_results(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        status, name = line.split("\t", 1)
        found[name.strip()] = status.strip()
    return found


def summarize(text: str) -> tuple[str, bool]:
    found = parse_results(text)
    rows = ["## iOS release verify", ""]
    ok = True
    for key, label in REQUIRED:
        status = found.get(key)
        if status != "PASS":
            status = "FAIL"
            ok = False
        rows.append(f"- {status} {label}")
    rows.append("")
    return "\n".join(rows), ok


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: summarize.py RESULTS.tsv", file=sys.stderr)
        return 2
    path = Path(argv[1])
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    body, ok = summarize(text)
    sys.stdout.write(body)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
