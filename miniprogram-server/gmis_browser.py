"""Fetch an authenticated GMIS timetable in an ephemeral browser session."""
from __future__ import annotations

import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

from gmis_parser import parse_html

TARGET = "https://gmis.xjtu.edu.cn/pyxx/pygl/xskbcx"
BROWSER_PATH = os.environ.get("CHROMIUM_PATH", "")


class ImportFailed(Exception):
    pass


def _school_host(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    return parsed.scheme == "https" and (host == "xjtu.edu.cn" or host.endswith(".xjtu.edu.cn"))


def fetch_schedule(username: str, password: str) -> dict:
    if not username or not password:
        raise ImportFailed("missing credentials")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=BROWSER_PATH or None,
            headless=True,
            args=["--no-sandbox", "--no-proxy-server"],
        )
        try:
            context = browser.new_context(locale="en-US", ignore_https_errors=False)
            page = context.new_page()
            page.goto(TARGET, wait_until="domcontentloaded", timeout=30000)
            if not _school_host(page.url):
                raise ImportFailed("unexpected login host")
            if "login.xjtu.edu.cn" in page.url:
                page.get_by_text("Password Login", exact=True).click(timeout=12000)
                page.locator('input[placeholder="Staff ID/Student ID/Phone"]:visible').fill(username)
                page.locator('input[placeholder="Enter Password"]:visible').fill(password)
                page.get_by_role("button", name="LOGIN", exact=True).click(timeout=12000)
                page.wait_for_url(lambda url: urlparse(url).hostname == "gmis.xjtu.edu.cn", timeout=25000)
                page.wait_for_load_state("domcontentloaded", timeout=25000)
                page.goto(TARGET, wait_until="domcontentloaded", timeout=30000)
            if urlparse(page.url).hostname != "gmis.xjtu.edu.cn":
                raise ImportFailed("login did not reach GMIS")
            for frame in page.frames:
                if not _school_host(frame.url):
                    continue
                if frame.locator("table#tbl").count():
                    return parse_html(frame.content())
            raise ImportFailed("timetable unavailable")
        except PlaywrightTimeout as exc:
            raise ImportFailed("school login timed out") from exc
        finally:
            browser.close()
