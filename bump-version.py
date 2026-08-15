#!/usr/bin/env python3
"""Focus version bumper — the app's own "AI" for sizing up code changes.

Run after making changes to the program:

    python bump-version.py

It fingerprints every source file, compares with the last run, classifies the
combined change as major / minor / patch, bumps the version shown in
Settings > About (app/version.js) and records the new fingerprint.

Classification (tweak the thresholds at the top if they don't match taste):
  * major (X.y.z) — a genuinely big change: a large amount of code churned.
    The major digit is never bumped lightly.
  * minor (x.Y.z) — a solid feature or noticeable change.
  * patch (x.y.Z) — a small touch-up (a CSS tweak, a one-liner).

Rollovers keep the digits inside the agreed limits:
  * the minor digit never passes 20  (the 21st minor bump rolls into a major)
  * the patch digit never passes 100 (the 101st patch rolls into a minor)
"""

import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
VERSION_FILE = os.path.join(ROOT, "app", "version.js")
STATE_FILE = os.path.join(ROOT, ".version-state.json")

# --- classification thresholds -----------------------------------------
# "Churn" = sum over changed files of |new bytes - old bytes|, plus a small
# bonus per touched file so editing many files counts for more than a one-liner.
MAJOR_CHURN = 12000   # a substantial feature / big rework
MINOR_CHURN = 1000    # a solid change
PER_FILE_BONUS = 150
MINOR_MAX = 20        # the minor digit never passes this value
PATCH_MAX = 100       # the patch digit never passes this value

# Source files the version tracks — everything the user edits to change the
# program. version.js itself, the state file, data backups and vendored
# libraries are deliberately excluded.
TRACKED_GLOBS = [
    "Focus-Workout-Tracker.html",
    "app/css/*.css",
    "app/js/*.js",
    "app/tests/*.html",
    "README.md",
]


def tracked_files():
    files = {}
    for pattern in TRACKED_GLOBS:
        for path in glob.glob(os.path.join(ROOT, pattern)):
            files[os.path.relpath(path, ROOT)] = path
    return files


def fingerprint(path):
    with open(path, "rb") as f:
        data = f.read()
    return {"size": len(data), "sha": hashlib.sha256(data).hexdigest()}


def read_version():
    try:
        with open(VERSION_FILE, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return (1, 0, 0)
    m = re.search(r"FOCUS_VERSION\s*=\s*\{\s*major:\s*(\d+),\s*minor:\s*(\d+),\s*patch:\s*(\d+)\s*\}", text)
    if not m:
        return (1, 0, 0)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def write_version(ver):
    major, minor, patch = ver
    content = (
        "/* App version — auto-managed by bump-version.py, do not edit by hand.\n"
        "   Run `python bump-version.py` after making changes to the program. */\n"
        f"window.FOCUS_VERSION = {{ major: {major}, minor: {minor}, patch: {patch} }};\n"
    )
    with open(VERSION_FILE, "w", encoding="utf-8") as f:
        f.write(content)


def bump(ver, kind):
    major, minor, patch = ver
    if kind == "major":
        return (major + 1, 0, 0)
    if kind == "minor":
        if minor >= MINOR_MAX:
            return (major + 1, 0, 0)
        return (major, minor + 1, 0)
    # patch
    if patch >= PATCH_MAX:
        minor += 1
        if minor > MINOR_MAX:
            return (major + 1, 0, 0)
        return (major, minor, 0)
    return (major, minor, patch + 1)


def main():
    files = tracked_files()
    snapshot = {rel: fingerprint(path) for rel, path in sorted(files.items())}

    state = {}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                state = json.load(f)
        except (OSError, ValueError):
            state = {}

    previous = state.get("snapshot", {})
    if not previous:
        state["snapshot"] = snapshot
        state["version"] = list(read_version())
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        print("First run — recorded the current state as the baseline (no bump).")
        print("Make changes, then run `python bump-version.py` again to bump the version.")
        return 0

    churn = 0
    changed = 0
    details = []
    for rel, current in snapshot.items():
        old = previous.get(rel)
        if not old or old["size"] != current["size"] or old["sha"] != current["sha"]:
            delta = current["size"] - (old["size"] if old else 0)
            churn += abs(delta) + PER_FILE_BONUS
            changed += 1
            details.append("  %s: %s bytes" % (rel, ("+" if delta >= 0 else "") + str(delta)))

    if changed == 0:
        print("No changes since the last bump — version stays %s." % ".".join(map(str, read_version())))
        return 0

    if churn >= MAJOR_CHURN:
        kind = "major"
    elif churn >= MINOR_CHURN:
        kind = "minor"
    else:
        kind = "patch"

    before = read_version()
    after = bump(before, kind)

    print("%d source file(s) changed:" % changed)
    print("\n".join(details))
    print("Total churn: %d bytes -> classified as a %s change" % (churn, kind))
    print("Version %s -> %s" % (".".join(map(str, before)), ".".join(map(str, after))))

    write_version(after)
    state["snapshot"] = snapshot
    state["version"] = list(after)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
