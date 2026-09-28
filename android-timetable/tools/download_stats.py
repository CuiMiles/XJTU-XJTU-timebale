"""Persistent counts for APK transfers and first opens, without hardware IDs."""

import hashlib
import os
import sqlite3
import time
import uuid
from pathlib import Path


DEFAULT_DB = Path.home() / ".local/share/xiaojiao-timetable/downloads.sqlite3"


class DownloadStats:
    def __init__(self, path=DEFAULT_DB):
        self.path = Path(path)

    def _connect(self):
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        db = sqlite3.connect(str(self.path), timeout=5)
        os.chmod(str(self.path), 0o600)
        db.execute("""CREATE TABLE IF NOT EXISTS downloads (
            ip TEXT PRIMARY KEY, count INTEGER NOT NULL,
            first_at INTEGER NOT NULL, last_at INTEGER NOT NULL
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS recent (
            ip TEXT NOT NULL, filename TEXT NOT NULL, counted_at INTEGER NOT NULL,
            PRIMARY KEY (ip, filename)
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS activations (
            id_hash TEXT PRIMARY KEY, ip TEXT NOT NULL,
            version_code INTEGER NOT NULL, first_at INTEGER NOT NULL
        )""")
        db.execute("CREATE INDEX IF NOT EXISTS activations_by_ip ON activations (ip)")
        return db

    def record(self, ip, filename, now=None):
        """Count one completed transfer; coalesce retries for 30 seconds."""
        now = int(time.time() if now is None else now)
        db = self._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT counted_at FROM recent WHERE ip=? AND filename=?",
                             (ip, filename)).fetchone()
            if row is not None and now - row[0] < 30:
                db.commit()
                return False
            db.execute("INSERT OR REPLACE INTO recent (ip, filename, counted_at) VALUES (?, ?, ?)",
                       (ip, filename, now))
            db.execute("DELETE FROM recent WHERE counted_at < ?", (now - 86400,))
            row = db.execute("SELECT count FROM downloads WHERE ip=?", (ip,)).fetchone()
            if row is None:
                db.execute("INSERT INTO downloads (ip, count, first_at, last_at) VALUES (?, 1, ?, ?)",
                           (ip, now, now))
            else:
                db.execute("UPDATE downloads SET count=count+1, last_at=? WHERE ip=?", (now, ip))
            db.commit()
            return True
        finally:
            db.close()

    def overview(self, page=1, per_page=100):
        db = self._connect()
        try:
            count, total = db.execute("SELECT COUNT(*), COALESCE(SUM(count), 0) FROM downloads").fetchone()
            rows = db.execute("""SELECT ip, count, first_at, last_at FROM downloads
                ORDER BY count DESC, last_at DESC LIMIT ? OFFSET ?""",
                (per_page, (page - 1) * per_page)).fetchall()
            return count, total, rows
        finally:
            db.close()

    def record_activation(self, install_id, ip, version_code, now=None):
        """Count a random installation UUID once; keep only its hash."""
        parsed = uuid.UUID(install_id)
        if parsed.version != 4 or str(parsed) != install_id:
            raise ValueError("invalid installation ID")
        if type(version_code) is not int or not 1 <= version_code <= 1_000_000:
            raise ValueError("invalid version code")
        now = int(time.time() if now is None else now)
        id_hash = hashlib.sha256(parsed.bytes).hexdigest()
        db = self._connect()
        try:
            cursor = db.execute("""INSERT OR IGNORE INTO activations
                (id_hash, ip, version_code, first_at) VALUES (?, ?, ?, ?)""",
                (id_hash, ip, version_code, now))
            db.commit()
            return cursor.rowcount == 1
        finally:
            db.close()

    def activation_overview(self, page=1, per_page=100):
        db = self._connect()
        try:
            total, unique_ips = db.execute(
                "SELECT COUNT(*), COUNT(DISTINCT ip) FROM activations").fetchone()
            rows = db.execute("""SELECT ip, COUNT(*), MIN(first_at), MAX(first_at)
                FROM activations GROUP BY ip ORDER BY COUNT(*) DESC, MAX(first_at) DESC
                LIMIT ? OFFSET ?""", (per_page, (page - 1) * per_page)).fetchall()
            return total, unique_ips, rows
        finally:
            db.close()
