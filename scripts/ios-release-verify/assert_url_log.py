#!/usr/bin/env python3
"""Judge CFNetwork diagnostics lines for the iOS release verify workflow.

Protocol Enqueue lines redact the path. Only lines containing ``url:`` show
the full path, so every check reads those lines. Zero-hit checks are accepted
only after at least one positive-control ``url:`` match. A missing match fails
the positive control and the zero-hit items.
"""

from __future__ import annotations

import sys
from pathlib import Path

POSITIVE = "api.fda.gov/food/enforcement.json"
URL_ITEMS = (
    ("url-positive-control", POSITIVE),
    ("url-zero-v1-devices", "/v1/devices"),
    ("url-zero-jacobrakai-org", "jacobrakai.org"),
    ("url-zero-PUT", "PUT"),
)


def url_lines(text: str) -> list[str]:
    return [line for line in text.splitlines() if "url:" in line]


def evaluate(text: str) -> list[tuple[str, str, int]]:
    """Return (status, item, hit count) for the four url-line checks."""
    lines = url_lines(text)
    positive_hits = [line for line in lines if POSITIVE in line]
    results: list[tuple[str, str, int]] = []
    if not positive_hits:
        results.append(("FAIL", "url-positive-control", 0))
        for item, needle in URL_ITEMS[1:]:
            hits = [line for line in lines if needle in line]
            results.append(("FAIL", item, len(hits)))
        return results

    results.append(("PASS", "url-positive-control", len(positive_hits)))
    for item, needle in URL_ITEMS[1:]:
        hits = [line for line in lines if needle in line]
        results.append(("FAIL" if hits else "PASS", item, len(hits)))
    return results


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: assert_url_log.py LOG", file=sys.stderr)
        return 2
    path = Path(argv[1])
    if path.is_file():
        text = path.read_text(encoding="utf-8", errors="replace")
    else:
        print(f"missing log: {path}", file=sys.stderr)
        text = ""

    lines = url_lines(text)
    results = evaluate(text)
    print(f"url: lines: {len(lines)}", file=sys.stderr)
    positive_ok = any(
        status == "PASS" and item == "url-positive-control" for status, item, _count in results
    )
    if not positive_ok:
        print(
            "zero-hit checks were not accepted: no positive-control url: line",
            file=sys.stderr,
        )
    failed = False
    for status, item, count in results:
        print(f"{item}: {status} ({count})", file=sys.stderr)
        print(f"{status}\t{item}")
        if status != "PASS":
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
