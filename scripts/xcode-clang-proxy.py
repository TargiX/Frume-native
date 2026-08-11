#!/usr/bin/env python3
"""Proxy Apple Clang around an Xcode 26.6 compiler-discovery pipe deadlock.

SwiftBuild launches `clang -v -E -dM ... /dev/null` to discover compiler
capabilities. On the affected Xcode/macOS combination it does not drain the
child pipes until the process exits, while the discovery output exceeds the
pipe capacity. Real compiler invocations are always executed unchanged.
"""

from __future__ import annotations

import os
import subprocess
import sys


# SwiftBuild's affected discovery pipe stops accepting data after 512 bytes.
# Leave some headroom instead of relying on the exact kernel boundary.
PIPE_SAFE_BYTES = 480

MACROS = {
    b"__APPLE__",
    b"__LP64__",
    b"__MACH__",
    b"__OBJC__",
    b"__STDC__",
    b"__STDC_VERSION__",
    b"__aarch64__",
    b"__apple_build_version__",
    b"__arm64",
    b"__arm64__",
    b"__clang__",
    b"__clang_major__",
    b"__clang_minor__",
    b"__clang_patchlevel__",
    b"__clang_version__",
    b"__cplusplus",
}

VERSION_PREFIXES = (
    b"Apple clang version ",
    b"Target: ",
    b"Thread model: ",
    b"InstalledDir: ",
)


def is_discovery_probe(arguments: list[str]) -> bool:
    return all(
        argument in arguments for argument in ("-v", "-E", "-dM", "/dev/null")
    )


def resolve_real_clang() -> str:
    """Resolve Clang from the active Xcode/DEVELOPER_DIR toolchain."""

    result = subprocess.run(
        ["/usr/bin/xcrun", "--find", "clang"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    path = result.stdout.decode("utf-8", errors="replace").strip()
    if result.returncode != 0 or not path or not os.path.isfile(path):
        message = result.stderr or b"unable to resolve Apple Clang\n"
        os.write(sys.stderr.fileno(), b"Frume clang proxy: " + message)
        raise RuntimeError("Apple Clang is unavailable")
    return path


def compact_macros(output: bytes) -> bytes:
    kept: list[bytes] = []
    for line in output.splitlines(keepends=True):
        fields = line.split(maxsplit=2)
        if len(fields) >= 2 and fields[0] == b"#define":
            if fields[1] in MACROS:
                kept.append(line)
    return b"".join(kept)


def compact_version(output: bytes) -> bytes:
    return b"".join(
        line
        for line in output.splitlines(keepends=True)
        if line.startswith(VERSION_PREFIXES)
    )


def main() -> int:
    arguments = sys.argv[1:]
    try:
        real_clang = resolve_real_clang()
    except RuntimeError:
        return 72

    if not is_discovery_probe(arguments):
        os.execv(real_clang, [real_clang, *arguments])

    result = subprocess.run(
        [real_clang, *arguments],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    macros = compact_macros(result.stdout)
    version = compact_version(result.stderr)
    if len(macros) > PIPE_SAFE_BYTES or len(version) > PIPE_SAFE_BYTES:
        os.write(
            sys.stderr.fileno(),
            b"Frume clang proxy: discovery response exceeded its safe limit\n",
        )
        return 70

    os.write(sys.stdout.fileno(), macros)
    os.write(sys.stderr.fileno(), version)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
