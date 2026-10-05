"""
serve.py — No-cache HTTP server for The Bridge Protocol frontend.
Forces the browser to never cache JS/HTML files so fixes apply immediately.
"""
import http.server
import socketserver

PORT = 5500
DIRECTORY = "."


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Serve files with no-cache headers to prevent stale JS module caching."""

    def end_headers(self):
        # Prevent ALL caching — critical for ES module development
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Show a cleaner log
        print(f"  [{self.client_address[0]}] {format % args}")


with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"[DEV] Frontend server running at http://127.0.0.1:{PORT}")
    print(f"[DEV] Serving directory: {DIRECTORY}")
    print("[DEV] Cache-Control: no-store (ESM modules will always reload)\n")
    httpd.serve_forever()
