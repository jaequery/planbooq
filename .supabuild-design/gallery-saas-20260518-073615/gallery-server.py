#!/usr/bin/env python3
"""Tiny static + /pick server for the /supabuild design gallery.

Serves files from its own directory, accepts POST /pick with JSON body
{variant, action, ts}, appends one JSON line per request to picks.jsonl,
and prints the bound port to stdout on startup.
"""
import http.server
import json
import os
import socket
import sys
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
PICKS = os.path.join(DIR, "picks.jsonl")
os.chdir(DIR)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_POST(self):  # noqa: N802
        if self.path != "/pick":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"{}")
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            body = {"raw": raw.decode("utf-8", "replace")}
        body.setdefault("ts", datetime.utcnow().isoformat() + "Z")
        body["received_at"] = datetime.utcnow().isoformat() + "Z"
        with open(PICKS, "a", encoding="utf-8") as f:
            f.write(json.dumps(body) + "\n")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}\n')


def find_free_port(preferred=8765):
    """Try preferred port first; fall back to OS-assigned."""
    for port in (preferred,):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind(("127.0.0.1", port))
            s.close()
            return port
        except OSError:
            continue
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def main():
    port = find_free_port(8765)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"GALLERY_PORT={port}", flush=True)
    print(f"GALLERY_URL=http://localhost:{port}/", flush=True)
    print(f"GALLERY_PICKS={PICKS}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
