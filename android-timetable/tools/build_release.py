#!/usr/bin/env python3
"""Build a reproducibly signed LAN APK without putting signing secrets in Git."""

import hashlib
import argparse
import json
import os
import re
import secrets
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SECRET_DIR = Path.home() / ".local/share/xiaojiao-timetable"
SECRET_FILE = SECRET_DIR / "signing.json"
KEYSTORE = SECRET_DIR / "release.jks"
DEFAULT_JDK = Path("/tmp/studydesk-tools/jdk")
DEFAULT_SDK = Path("/tmp/studydesk-tools/sdk")
DEFAULT_GRADLE = Path("/tmp/studydesk-tools/gradle-8.13/bin/gradle")


def signing_config(jdk: Path) -> dict:
    if SECRET_FILE.exists():
        config = json.loads(SECRET_FILE.read_text())
        if not KEYSTORE.exists():
            raise RuntimeError("签名文件丢失，不能用新密钥覆盖旧版本")
        return config
    SECRET_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(SECRET_DIR, 0o700)
    password = secrets.token_urlsafe(48)
    config = {"password": password, "alias": "xiaojiao"}
    keytool = jdk / "bin/keytool"
    env = os.environ.copy()
    env["XIAOJIAO_KEYSTORE_PASS"] = password
    subprocess.run(
        [str(keytool), "-genkeypair", "-alias", config["alias"], "-keyalg", "RSA",
         "-keysize", "3072", "-validity", "10000", "-dname", "CN=Xiaojiao Timetable",
         "-keystore", str(KEYSTORE), "-storetype", "PKCS12",
         "-storepass:env", "XIAOJIAO_KEYSTORE_PASS",
         "-keypass:env", "XIAOJIAO_KEYSTORE_PASS", "-noprompt"],
        check=True, env=env, stdout=subprocess.DEVNULL,
    )
    os.chmod(KEYSTORE, 0o600)
    with SECRET_FILE.open("x") as out:
        json.dump(config, out)
    os.chmod(SECRET_FILE, 0o600)
    return config


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true", help="verify and publish an already built release APK")
    args = parser.parse_args()
    jdk = Path(os.environ.get("JAVA_HOME", DEFAULT_JDK))
    sdk = Path(os.environ.get("ANDROID_HOME", DEFAULT_SDK))
    gradle = Path(os.environ.get("GRADLE_BIN", DEFAULT_GRADLE))
    if not gradle.is_file():
        gradle = ROOT / "gradlew"
    if not (jdk / "bin/java").is_file() or not sdk.is_dir():
        raise RuntimeError("请设置 JAVA_HOME 和 ANDROID_HOME 后重试")
    config = signing_config(jdk)
    env = os.environ.copy()
    env.update({
        "JAVA_HOME": str(jdk), "ANDROID_HOME": str(sdk),
        "PATH": str(jdk / "bin") + os.pathsep + env.get("PATH", ""),
        "GRADLE_USER_HOME": str(Path(os.environ.get("GRADLE_USER_HOME", "/tmp/studydesk-tools/gradle-home"))),
        "XIAOJIAO_SIGNING_STORE_FILE": str(KEYSTORE),
        "XIAOJIAO_SIGNING_STORE_PASSWORD": config["password"],
        "XIAOJIAO_SIGNING_KEY_ALIAS": config["alias"],
        "XIAOJIAO_SIGNING_KEY_PASSWORD": config["password"],
    })
    if not args.verify_only:
        subprocess.run([str(gradle), ":app:testDebugUnitTest", ":app:lintDebug", ":app:assembleRelease",
                        "--no-daemon", "--console=plain"], cwd=ROOT, env=env, check=True)
    apk = ROOT / "app/build/outputs/apk/release/app-release.apk"
    apksigner = sdk / "build-tools/35.0.0/apksigner"
    subprocess.run([str(apksigner), "verify", "--verbose", str(apk)], env=env, check=True)
    gradle_config = (ROOT / "app/build.gradle.kts").read_text()
    version = re.search(r'versionName\s*=\s*"([^"]+)"', gradle_config).group(1)
    version_code = int(re.search(r'versionCode\s*=\s*(\d+)', gradle_config).group(1))
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    target = dist / f"xiaojiao-timetable-{version}.apk"
    for published in (target, dist / "xiaojiao-timetable.apk"):
        pending = published.with_name(published.name + ".tmp")
        shutil.copy2(apk, pending)
        os.replace(str(pending), str(published))
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    digest_pending = dist / "sha256.txt.tmp"
    digest_pending.write_text(f"{digest}  {target.name}\n")
    os.replace(str(digest_pending), str(dist / "sha256.txt"))
    version_pending = dist / "version.json.tmp"
    version_pending.write_text(json.dumps({
        "versionCode": version_code,
        "versionName": version,
        "apk": target.name,
        "sha256": digest,
    }, ensure_ascii=False) + "\n")
    os.replace(str(version_pending), str(dist / "version.json"))
    print(f"Signed APK: {target}\nSHA-256: {digest}")


if __name__ == "__main__":
    main()
