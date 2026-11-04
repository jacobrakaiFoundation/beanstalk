#!/usr/bin/env python3
"""Require the url assert to fail because the negative-control GET was seen.

The positive control must still pass, and PUT must stay absent. A failure
caused only by a missing positive control does not count.
"""

from __future__ import annotations

import sys
from pathlib import Path

EXPECTED = {
    "url-positive-control": "PASS",
    "url-zero-v1-devices": "FAIL",
    "url-zero-jacobrakai-org": "FAIL",
    "url-zero-PUT": "PASS",
}


def parse_results(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or "\t" not in line:
            continue
        status, name = line.split("\t", 1)
        found[name.strip()] = status.strip()
    return found


def matches(text: str) -> tuple[bool, str]:
    found = parse_results(text)
    for name, status in EXPECTED.items():
        actual = found.get(name)
        if actual != status:
            return False, f"{name} is {actual}, expected {status}"
    return True, "negative control tripped /v1/devices and jacobrakai.org on url: lines"


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: expect_negative_control.py RESULTS.tsv", file=sys.stderr)
        return 2
    text = Path(argv[1]).read_text(encoding="utf-8")
    ok, message = matches(text)
    print(message)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
