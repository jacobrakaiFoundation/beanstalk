#!/usr/bin/env python3
"""Inverted check for the temporary negative-control launch.

The step passes only when the A2 assert exits non-zero and its output names
`/v1/devices`. The check label `url-zero-v1-devices` does not count.
"""

from __future__ import annotations

import sys
from pathlib import Path

DEVICES = "/v1/devices"


def matches(exit_code: int, output: str) -> tuple[bool, str]:
    if exit_code == 0:
        return False, "A2 assert exited 0"
    if DEVICES not in output:
        return False, "A2 assert output did not name /v1/devices"
    return True, "negative control: A2 assert exited non-zero and named /v1/devices"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: expect_negative_control.py EXIT_CODE OUTPUT_FILE", file=sys.stderr)
        return 2
    exit_code = int(argv[1])
    output = Path(argv[2]).read_text(encoding="utf-8", errors="replace")
    ok, message = matches(exit_code, output)
    print(message)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
