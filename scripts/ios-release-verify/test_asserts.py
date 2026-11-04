#!/usr/bin/env python3
"""Host-side checks for the iOS release verify assert scripts."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from assert_screenshots import evaluate as evaluate_screenshots
from assert_url_log import evaluate as evaluate_url_log
from expect_negative_control import matches as negative_control_matches
from summarize import REQUIRED, summarize

WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "ios-release-verify.yml"


POSITIVE = "url: https://api.fda.gov/food/enforcement.json?limit=20&skip=0&sort=report_date:desc"


def statuses(text: str) -> dict[str, str]:
    return {item: status for status, item, _count in evaluate_url_log(text)}


class UrlLogTests(unittest.TestCase):
    def test_positive_url_line_passes_and_ignores_redacted_enqueue_lines(self) -> None:
        log = "\n".join(
            [
                "Protocol Enqueue: https://api.fda.gov/<redacted>",
                "Protocol Enqueue PUT https://api.jacobrakai.org/v1/devices",
                POSITIVE,
            ]
        )
        self.assertEqual(
            statuses(log),
            {
                "url-positive-control": "PASS",
                "url-zero-v1-devices": "PASS",
                "url-zero-jacobrakai-org": "PASS",
                "url-zero-PUT": "PASS",
            },
        )

    def test_forbidden_strings_on_url_lines_fail_after_positive_control(self) -> None:
        log = "\n".join(
            [
                POSITIVE,
                "url: https://api.jacobrakai.org/v1/devices",
                "url: PUT https://example.test/item",
            ]
        )
        found = statuses(log)
        self.assertEqual(found["url-positive-control"], "PASS")
        self.assertEqual(found["url-zero-v1-devices"], "FAIL")
        self.assertEqual(found["url-zero-jacobrakai-org"], "FAIL")
        self.assertEqual(found["url-zero-PUT"], "FAIL")

    def test_redacted_log_without_url_lines_does_not_pass_zero_hits(self) -> None:
        log = "\n".join(
            [
                "Protocol Enqueue: https://api.fda.gov/<private>",
                "Task <private> finished",
            ]
        )
        found = statuses(log)
        self.assertTrue(all(status == "FAIL" for status in found.values()))
        self.assertEqual(len(found), 4)

    def test_uppercase_url_label_is_not_a_url_line(self) -> None:
        log = "URL: https://api.fda.gov/food/enforcement.json"
        self.assertEqual(statuses(log)["url-positive-control"], "FAIL")

    def test_positive_control_is_required_before_zero_hits_can_pass(self) -> None:
        log = "url: https://example.test/healthz"
        found = statuses(log)
        self.assertEqual(found["url-positive-control"], "FAIL")
        self.assertEqual(found["url-zero-v1-devices"], "FAIL")
        self.assertEqual(found["url-zero-jacobrakai-org"], "FAIL")
        self.assertEqual(found["url-zero-PUT"], "FAIL")


class ScreenshotTests(unittest.TestCase):
    def test_distinct_pngs_pass(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            for name, payload in (
                ("01-recall-list.png", b"list"),
                ("02-recall-detail.png", b"detail"),
                ("03-settings-disclaimer.png", b"settings"),
            ):
                (directory / name).write_bytes(payload * 5000)
            results, lines = evaluate_screenshots(directory)
            self.assertTrue(all(status == "PASS" for status, _item in results))
            self.assertEqual(len({line.split()[0] for line in lines}), 3)

    def test_identical_pngs_fail_distinct_check(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            blob = b"same" * 5000
            for name in (
                "01-recall-list.png",
                "02-recall-detail.png",
                "03-settings-disclaimer.png",
            ):
                (directory / name).write_bytes(blob)
            results, _lines = evaluate_screenshots(directory)
            found = dict((item, status) for status, item in results)
            self.assertEqual(found["screenshot-recall-list"], "PASS")
            self.assertEqual(found["screenshot-sha256-distinct"], "FAIL")

    def test_missing_png_fails(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            results, _lines = evaluate_screenshots(Path(raw))
            self.assertTrue(all(status == "FAIL" for status, _item in results))


class WorkflowContractTests(unittest.TestCase):
    def test_release_verify_workflow_stays_unsigned_and_off_pull_requests(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("branches: [main]", text)
        self.assertIn("workflow_dispatch:", text)
        self.assertIn("pull_request:", text)
        self.assertNotIn("pull_request_target:", text)
        self.assertIn("ios/UITests/**", text)
        self.assertIn("scripts/ios-release-verify/**", text)
        self.assertIn("-BeanstalkNegativeControl", text)
        self.assertNotIn("${{ secrets", text)
        self.assertNotRegex(text, r"secrets\.[A-Za-z0-9_]+")
        self.assertIn("contents: read", text)
        self.assertIn("runs-on: macos-26", text)
        self.assertIn("ref: ${{ github.sha }}", text)
        self.assertIn("CODE_SIGNING_ALLOWED=NO", text)
        self.assertIn("SIMCTL_CHILD_CFNETWORK_DIAGNOSTICS=3 xcrun simctl launch", text)
        self.assertIn("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", text)
        self.assertIn("actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9", text)
        for line in text.splitlines():
            if "CFNETWORK_DIAGNOSTICS" in line:
                self.assertIn("SIMCTL_CHILD_CFNETWORK_DIAGNOSTICS", line)
            if line.strip().startswith("uses:"):
                self.assertRegex(line, r"@[0-9a-f]{40}")


class NegativeControlTests(unittest.TestCase):
    def test_expected_failure_is_accepted(self) -> None:
        text = "\n".join(
            [
                "PASS\turl-positive-control",
                "FAIL\turl-zero-v1-devices",
                "FAIL\turl-zero-jacobrakai-org",
                "PASS\turl-zero-PUT",
            ]
        )
        ok, _message = negative_control_matches(text)
        self.assertTrue(ok)

    def test_clean_pass_is_rejected(self) -> None:
        text = "\n".join(f"PASS\t{name}" for name in (
            "url-positive-control",
            "url-zero-v1-devices",
            "url-zero-jacobrakai-org",
            "url-zero-PUT",
        ))
        ok, _message = negative_control_matches(text)
        self.assertFalse(ok)

    def test_missing_positive_control_is_rejected(self) -> None:
        text = "\n".join(
            [
                "FAIL\turl-positive-control",
                "FAIL\turl-zero-v1-devices",
                "FAIL\turl-zero-jacobrakai-org",
                "PASS\turl-zero-PUT",
            ]
        )
        ok, _message = negative_control_matches(text)
        self.assertFalse(ok)


class SummaryTests(unittest.TestCase):
    def test_missing_item_fails(self) -> None:
        body, ok = summarize("PASS\tcheckout-github-sha\n")
        self.assertFalse(ok)
        self.assertIn("- PASS Checked out `github.sha`", body)
        self.assertIn("- FAIL Unsigned `xcodebuild archive` (`CODE_SIGNING_ALLOWED=NO`)", body)
        self.assertEqual(body.count("\n- "), len(REQUIRED))

    def test_explicit_fail_fails(self) -> None:
        rows = "\n".join(f"PASS\t{key}" for key, _label in REQUIRED)
        rows = rows.replace("PASS\turl-zero-PUT", "FAIL\turl-zero-PUT")
        _body, ok = summarize(rows)
        self.assertFalse(ok)

    def test_all_pass(self) -> None:
        rows = "\n".join(f"PASS\t{key}" for key, _label in REQUIRED)
        body, ok = summarize(rows)
        self.assertTrue(ok)
        self.assertNotIn("FAIL", body)


if __name__ == "__main__":
    unittest.main()
