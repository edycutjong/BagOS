"""
general_agent — General-purpose clinical assistant (no FHIR required).

Package initialisation order:
  1. Load .env so every subsequent import sees the right environment variables.
  2. Suppress ADK [EXPERIMENTAL] warnings (noise during normal operation).
  3. Configure the package-wide ANSI logger.
  4. Import root_agent so the ADK CLI / web UI can discover it.
"""
import warnings

from dotenv import load_dotenv

load_dotenv()

warnings.filterwarnings(
    "ignore",
    message=r".*\[EXPERIMENTAL\].*",
    category=UserWarning,
)

from shared.logging_utils import configure_logging  # noqa: E402
configure_logging("general_agent")

from .agent import root_agent  # noqa: E402, F401

__all__ = ["root_agent"]
