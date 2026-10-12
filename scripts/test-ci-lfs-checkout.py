"""Exercise checkout's conflicting headers against a local LFS server."""
import base64
import hashlib
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest


SCRIPT = Path(__file__).with_name("ci-lfs-checkout.sh").resolve()
CONTENT = b"pinned source fixture\n"
OID = hashlib.sha256(CONTENT).hexdigest()
TOKEN = "fixture-job-token"
BASIC = "Basic " + base64.b64encode(("x-access-token:" + TOKEN).encode()).decode()
BEARER = "Bearer fixture-lfs-token"


class CheckoutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.requests = []
        self.foreign_download = False
        case = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, status, content, content_type="application/json"):
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                if self.headers.get("Authorization") != BASIC:
                    self.reply(401, b'{"message":"batch authentication required"}')
                    return
                host = "127.0.0.1" if case.foreign_download else "localhost"
                href = f"http://{host}:{case.server.server_port}/objects/{OID}"
                data = {"objects": [{"oid": OID, "size": len(CONTENT), "actions": {
                    "download": {"href": href, "header": {"Authorization": BEARER}}
                }}]}
                self.reply(200, json.dumps(data).encode(), "application/vnd.git-lfs+json")

            def do_GET(self):
                headers = self.headers.get_all("Authorization", [])
                case.requests.append(headers)
                if case.foreign_download or headers != [BEARER]:
                    self.reply(401, b'{"message":"conflicting download authentication"}')
                else:
                    self.reply(200, CONTENT, "application/octet-stream")

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.addCleanup(self.server.server_close)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.shutdown)
        self.url = f"http://localhost:{self.server.server_port}"
        self.env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull,
                    "GIT_CONFIG_SYSTEM": os.devnull, "GIT_TERMINAL_PROMPT": "0",
                    "GITHUB_SERVER_URL": self.url,
                    "CI_LFS_TOKEN": TOKEN}
        self.git("init", "-q")
        self.git("lfs", "install", "--local")
        self.git("config", "remote.origin.url", self.url + "/fixture.git")
        self.git("config", "lfs.transfer.maxretries", "1")
        self.git("config", "lfs.transfer.maxretrydelay", "1")
        self.header_key = f"http.{self.url}/.extraheader"
        self.git("config", self.header_key, "Authorization: " + BASIC)
        (self.root / ".gitattributes").write_text("source.dat filter=lfs diff=lfs merge=lfs -text\n")
        (self.root / "source.dat").write_text(
            f"version https://git-lfs.github.com/spec/v1\noid sha256:{OID}\nsize {len(CONTENT)}\n")
        self.git("add", ".")
        self.git("-c", "user.name=CI fixture", "-c", "user.email=ci@example.invalid",
                 "-c", "commit.gpgsign=false", "commit", "-qm", "fixture")

    def git(self, *args, check=True):
        return subprocess.run(["git", *args], cwd=self.root, env=self.env,
                              capture_output=True, text=True, check=check, timeout=20)

    def checkout(self):
        return subprocess.run(["bash", str(SCRIPT)], cwd=self.root, env=self.env,
                              capture_output=True, text=True, timeout=20)

    def test_conflict_is_reproduced_and_helper_fetches_verified_bytes(self):
        self.assertNotEqual(self.git("lfs", "pull", check=False).returncode, 0)
        self.assertTrue(self.requests)
        self.assertTrue(any(headers != [BEARER] for headers in self.requests))
        self.requests.clear()
        result = self.checkout()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "source.dat").read_bytes(), CONTENT)
        self.assertEqual(self.requests, [[BEARER]])
        self.assertEqual(self.git("config", "--get", self.header_key).stdout.strip(),
                         "Authorization: " + BASIC)
        self.assertNotIn(TOKEN, result.stdout + result.stderr)

    def test_other_download_host_never_receives_job_credentials(self):
        self.foreign_download = True
        result = self.checkout()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.requests)
        self.assertTrue(all(BASIC not in headers for headers in self.requests))
        self.assertNotIn(TOKEN, result.stdout + result.stderr)
        self.assertEqual(self.git("config", "--get", self.header_key).stdout.strip(),
                         "Authorization: " + BASIC)

    def test_multiple_header_values_are_restored(self):
        self.git("config", "--add", self.header_key, "X-CI-Fixture: retained")
        before = self.git("config", "--get-all", self.header_key).stdout
        result = self.checkout()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git("config", "--get-all", self.header_key).stdout, before)

    def test_missing_token_refuses_before_transport(self):
        self.env["CI_LFS_TOKEN"] = ""
        result = self.checkout()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.requests, [])


if __name__ == "__main__":
    unittest.main()
