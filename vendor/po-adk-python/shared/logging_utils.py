"""
Logging utilities — ANSI colour formatter and shared log helpers.

Call configure_logging(package_name) once at startup (done automatically by
each agent's __init__.py).  All sub-modules obtain their logger via
logging.getLogger(__name__); they inherit the handler registered here on the
named package logger.
"""
import ctypes
import hashlib
import json
import logging
import os


# ── ANSI colour formatter ──────────────────────────────────────────────────────

class _AnsiColorFormatter(logging.Formatter):
    LEVEL_COLORS = {
        logging.DEBUG:    "\x1b[36m",   # cyan
        logging.INFO:     "\x1b[32m",   # green
        logging.WARNING:  "\x1b[33m",   # yellow
        logging.ERROR:    "\x1b[31m",   # red
        logging.CRITICAL: "\x1b[35m",   # magenta
    }
    RESET = "\x1b[0m"

    def format(self, record):
        color = self.LEVEL_COLORS.get(record.levelno, "")
        original = record.levelname
        record.levelname = f"{color}{original}{self.RESET}" if color else original
        try:
            return super().format(record)
        finally:
            record.levelname = original


def _enable_windows_ansi():
    """Enable VT-100 escape codes on Windows consoles."""
    if os.name != "nt":
        return
    try:
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
        if handle == 0:
            return
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)) == 0:
            return
        kernel32.SetConsoleMode(handle, mode.value | 0x0004)  # ENABLE_VIRTUAL_TERMINAL_PROCESSING
    except Exception:
        return


def configure_logging(package_name: str):
    """
    Configure a named package logger with an ANSI-colour handler.

    All child loggers (e.g. healthcare_agent.agent, general_agent.middleware)
    propagate to their package logger and share this handler.
    Idempotent — safe to call multiple times with the same package name.

    Args:
        package_name: The top-level package to configure, e.g. "healthcare_agent".
    """
    _enable_windows_ansi()
    pkg = logging.getLogger(package_name)
    if pkg.handlers:
        return
    pkg.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(
        _AnsiColorFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    pkg.addHandler(handler)
    pkg.propagate = False


# ── Shared helpers used by middleware and fhir_hook ────────────────────────────

def safe_pretty_json(value) -> str:
    """Serialize *value* to an indented JSON string, falling back to str()."""
    try:
        return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, default=str)
    except Exception:
        return str(value)


def serialize_for_log(value):
    """Return a JSON-serialisable representation of *value* (Pydantic-aware)."""
    if value is None:
        return None
    if isinstance(value, (dict, list, tuple, str, int, float, bool)):
        return value
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return model_dump(mode="json")
        except TypeError:
            return model_dump()
        except Exception:
            return str(value)
    return str(value)


def redact_headers(headers: dict) -> dict:
    """Return a copy of *headers* with sensitive values replaced by [REDACTED]."""
    if not isinstance(headers, dict):
        return headers
    redacted = dict(headers)
    sensitive = {"x-api-key", "authorization", "cookie", "set-cookie"}
    for key in list(redacted.keys()):
        if str(key).lower() in sensitive:
            redacted[key] = f"[REDACTED len={len(str(redacted[key]))}]"
    return redacted


def token_fingerprint(token: str) -> str:
    """Return a non-sensitive fingerprint of a bearer/FHIR token for log output."""
    if not token:
        return "empty"
    digest = hashlib.sha256(token.encode()).hexdigest()[:12]
    return f"len={len(token)} sha256={digest}"
