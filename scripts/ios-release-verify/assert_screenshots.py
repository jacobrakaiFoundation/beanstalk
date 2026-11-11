#!/usr/bin/env python3
"""Require three non-empty screenshots with distinct sha256 values."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

FILES = (
    ("screenshot-recall-list", "01-recall-list.png"),
    ("screenshot-recall-detail", "02-recall-detail.png"),
    ("screenshot-settings-disclaimer", "03-settings-disclaimer.png"),
)
MIN_BYTES = 10_000


def evaluate(directory: Path) -> tuple[list[tuple[str, str]], list[str]]:
    results: list[tuple[str, str]] = []
    digests: list[str | None] = []
    lines: list[str] = []
    for item, name in FILES:
        path = directory / name
        if not path.is_file() or path.stat().st_size < MIN_BYTES:
            results.append(("FAIL", item))
            digests.append(None)
            lines.append(f"missing-or-small\t{name}")
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        results.append(("PASS", item))
        digests.append(digest)
        lines.append(f"{digest}  {name}")
    distinct = [digest for digest in digests if digest is not None]
    if len(distinct) == 3 and len(set(distinct)) == 3:
        results.append(("PASS", "screenshot-sha256-distinct"))
    else:
        results.append(("FAIL", "screenshot-sha256-distinct"))
    return results, lines


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: assert_screenshots.py DIRECTORY", file=sys.stderr)
        return 2
    directory = Path(argv[1])
    results, lines = evaluate(directory)
    hash_path = directory / "sha256.txt"
    if directory.is_dir():
        hash_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    for line in lines:
        print(line, file=sys.stderr)
    failed = False
    for status, item in results:
        print(f"{status}\t{item}")
        if status != "PASS":
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
