#!/usr/bin/env python3
"""Print the UDID of an available iPhone simulator, creating one if needed."""

from __future__ import annotations

import json
import re
import subprocess
import sys


def simctl(kind: str) -> dict:
    return json.loads(subprocess.check_output(["xcrun", "simctl", "list", kind, "-j"], text=True))


def runtime_key(value: str) -> list[int]:
    return [int(part) for part in re.findall(r"\d+", value)]


def create_device(name: str) -> str:
    runtimes = [
        runtime
        for runtime in simctl("runtimes").get("runtimes", [])
        if runtime.get("isAvailable") and "iOS" in runtime.get("name", "")
    ]
    if not runtimes:
        raise SystemExit("no iOS simulator runtime")
    runtime = max(runtimes, key=lambda item: runtime_key(str(item.get("version", ""))))
    types = [
        device_type
        for device_type in simctl("devicetypes").get("devicetypes", [])
        if str(device_type.get("name", "")).startswith("iPhone") and "SE" not in str(device_type.get("name", ""))
    ]
    if not types:
        raise SystemExit("no iPhone simulator device type")

    def type_rank(device_type: dict) -> tuple[int, str]:
        numbers = [int(part) for part in re.findall(r"\d+", str(device_type.get("name", "")))]
        return (numbers[0] if numbers else 0, str(device_type.get("name", "")))

    device_type = max(types, key=type_rank)
    return subprocess.check_output(
        [
            "xcrun",
            "simctl",
            "create",
            name,
            str(device_type["identifier"]),
            str(runtime["identifier"]),
        ],
        text=True,
    ).strip()


def main() -> int:
    devices = simctl("devices").get("devices", {})
    candidates: list[tuple[str, dict]] = []
    for runtime, entries in devices.items():
        if "SimRuntime.iOS" not in runtime:
            continue
        for device in entries:
            if not device.get("isAvailable"):
                continue
            if not str(device.get("name", "")).startswith("iPhone"):
                continue
            candidates.append((runtime, device))
    if candidates:
        newest = max((runtime for runtime, _device in candidates), key=runtime_key)
        pool = [device for runtime, device in candidates if runtime == newest]
        booted = [device for device in pool if device.get("state") == "Booted"]
        chosen = (booted or pool)[-1]
        print(chosen["udid"])
        return 0

    print(create_device("Beanstalk Release Verify"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
