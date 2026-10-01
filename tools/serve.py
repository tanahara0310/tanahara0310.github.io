"""手元で確認するためのサーバー。ブラウザにキャッシュさせないので、保存してすぐ再読み込みすれば反映される。

使い方: python tools/serve.py [ポート番号]
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"http://localhost:{port}/")
        server.serve_forever()


if __name__ == "__main__":
    main()
