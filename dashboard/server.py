#!/usr/bin/env python3
"""
Motion Detection Dashboard Server
Parses motion_log.txt and serves it as JSON to the browser dashboard.

Usage:
  python3 server.py                              # /tmp/motion_log.txt, port 8080
  python3 server.py /path/to/motion_log.txt      # custom log path
  python3 server.py /path/to/motion_log.txt 9000 # custom log + port

Getting the log out of QEMU (inside the guest shell):
  cat /tmp/motion_log.txt | nc 10.0.2.2 9001
  # On host before booting:
  nc -l 9001 > /tmp/motion_log.txt

Or run the host binary directly to produce a local log:
  cd ~/motion_detect
  ./motion_detect_host motion.conf     # reads test_frames/, writes /tmp/motion_log.txt
"""

import http.server
import json
import os
import re
import sys
import time
from pathlib import Path

# ── Configuration ─────────────────────────────────────────────────────────────
_explicit_log = sys.argv[1] if len(sys.argv) > 1 else None

# Auto-discover if no explicit path given
_candidates = [
    _explicit_log,
    "/tmp/motion_log.txt",
    str(Path(__file__).parent.parent / "build" / "motion_log.txt"),
    str(Path.home() / "motion_log.txt"),
]
LOG_FILE = _explicit_log or next(
    (p for p in _candidates[1:] if p and Path(p).exists()),
    "/tmp/motion_log.txt",
)

PORT          = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
DASHBOARD_DIR = Path(__file__).parent
START_TS      = time.time()

# measurements.txt lives in the project root (one level up from dashboard/)
METRICS_FILE = str(DASHBOARD_DIR.parent / "measurements.txt")

# ── Log parser ────────────────────────────────────────────────────────────────
# Matches lines produced by logger.c:
# [2026-06-07T09:18:08Z] MOTION=LOW     frame=frame_01.pgm    changed=16/256 (6.2%)
_LINE_RE = re.compile(
    r"\[(?P<ts>[^\]]+)\]\s+MOTION=(?P<level>\w+)\s+frame=(?P<frame>\S+)\s+"
    r"changed=(?P<changed>\d+)/(?P<total>\d+)\s*\((?P<pct>[\d.]+)%\)"
)
_LEVEL_N = {"NONE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}


def parse_log(path: str) -> list:
    events = []
    try:
        with open(path, "r") as fh:
            for line in fh:
                m = _LINE_RE.search(line)
                if not m:
                    continue
                level = m.group("level").strip()
                events.append({
                    "ts":      m.group("ts").strip(),
                    "level":   level,
                    "level_n": _LEVEL_N.get(level, 0),
                    "frame":   m.group("frame").strip(),
                    "changed": int(m.group("changed")),
                    "total":   int(m.group("total")),
                    "pct":     float(m.group("pct")),
                })
    except FileNotFoundError:
        pass
    except Exception as exc:
        print(f"[server] parse error: {exc}", file=sys.stderr)
    return events


def _parse_measurements(path: str) -> dict:
    """Parse INI-style measurements.txt → flat dict of key/value strings."""
    sections: dict = {}
    current = "preamble"
    buf: list = []
    try:
        with open(path) as f:
            for line in f:
                line = line.rstrip("\n")
                if line.startswith("#"):
                    continue
                if line.startswith("[") and line.endswith("]"):
                    sections[current] = "\n".join(buf)
                    current, buf = line[1:-1], []
                else:
                    buf.append(line)
        sections[current] = "\n".join(buf)
    except FileNotFoundError:
        return {}

    result = {}
    for section in ("PARSED", "HOST"):
        for line in sections.get(section, "").splitlines():
            if "=" in line:
                k, _, v = line.partition("=")
                result[k.strip()] = v.strip()

    result["raw_free_m"]  = sections.get("RAW_FREE_M",  "").strip()
    result["raw_meminfo"] = sections.get("RAW_MEMINFO", "").strip()
    result["raw_cpuinfo"] = sections.get("RAW_CPUINFO", "").strip()
    return result


def _metrics_payload() -> dict:
    data = _parse_measurements(METRICS_FILE)
    return {
        "available":   bool(data),
        "file":        METRICS_FILE,
        "exists":      Path(METRICS_FILE).exists(),
        "parsed":      data,
        "server_ts":   time.time(),
    }


def _log_payload() -> dict:
    events = parse_log(LOG_FILE)
    counts = {"NONE": 0, "LOW": 0, "MEDIUM": 0, "HIGH": 0}
    for e in events:
        counts[e["level"]] = counts.get(e["level"], 0) + 1
    return {
        "log_file":  LOG_FILE,
        "exists":    Path(LOG_FILE).exists(),
        "events":    events,
        "counts":    counts,
        "total":     len(events),
        "server_ts": time.time(),
    }


# ── HTTP handler ──────────────────────────────────────────────────────────────
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DASHBOARD_DIR), **kwargs)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/log":
            self._json(_log_payload())
        elif path == "/api/metrics":
            self._json(_metrics_payload())
        elif path == "/api/status":
            self._json({"ok": True, "log_file": LOG_FILE,
                        "uptime_s": round(time.time() - START_TS, 1)})
        else:
            # Serve index.html for "/" so the browser opens the dashboard
            super().do_GET()

    def _json(self, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type",  "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Only show non-200 responses to keep console clean
        if args and len(args) >= 2 and str(args[1]) not in ("200", "304"):
            super().log_message(fmt, *args)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    server = http.server.HTTPServer(("", PORT), Handler)
    w = 50
    print("┌" + "─" * w + "┐")
    print(f"│  Motion Detection Dashboard{' ' * (w - 28)}│")
    print(f"│  http://localhost:{PORT:<{w-19}}│")
    print(f"│  Log → {LOG_FILE:<{w-8}}│")
    print("└" + "─" * w + "┘")
    print()
    print("  Live log injection from QEMU guest:")
    print("    guest# cat /tmp/motion_log.txt | nc 10.0.2.2 9001")
    print("    host#  nc -l 9001 > /tmp/motion_log.txt")
    print()
    print("  Or run host binary to generate a local log:")
    print("    cd ~/motion_detect && ./motion_detect_host motion.conf")
    print()
    print("  Ctrl+C to stop")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[server] stopped")
