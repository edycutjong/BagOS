"""
General-purpose tools — no FHIR server required.

These tools demonstrate the tool pattern without any external API dependency.
They work immediately after cloning the repo with just a Google API key.

get_current_datetime  Returns the current date and time in any IANA timezone.
look_up_icd10         Returns the ICD-10-CM code for common clinical conditions
                      using a small built-in reference table.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from google.adk.tools import ToolContext

logger = logging.getLogger(__name__)


# ── ICD-10-CM mini reference table ─────────────────────────────────────────────
# Extend this dict or replace it with a call to a real terminology server.

_ICD10_TABLE: dict[str, tuple[str, str]] = {
    "hypertension":           ("I10",    "Essential (primary) hypertension"),
    "diabetes type 1":        ("E10.9",  "Type 1 diabetes mellitus without complications"),
    "diabetes type 2":        ("E11.9",  "Type 2 diabetes mellitus without complications"),
    "asthma":                 ("J45.909","Unspecified asthma, uncomplicated"),
    "copd":                   ("J44.9",  "Chronic obstructive pulmonary disease, unspecified"),
    "heart failure":          ("I50.9",  "Heart failure, unspecified"),
    "atrial fibrillation":    ("I48.91", "Unspecified atrial fibrillation"),
    "ckd":                    ("N18.9",  "Chronic kidney disease, unspecified stage"),
    "hyperlipidemia":         ("E78.5",  "Hyperlipidemia, unspecified"),
    "depression":             ("F32.9",  "Major depressive disorder, single episode, unspecified"),
    "anxiety":                ("F41.9",  "Anxiety disorder, unspecified"),
    "obesity":                ("E66.9",  "Obesity, unspecified"),
    "hypothyroidism":         ("E03.9",  "Hypothyroidism, unspecified"),
    "osteoarthritis":         ("M19.90", "Unspecified primary osteoarthritis, unspecified site"),
    "gerd":                   ("K21.0",  "Gastro-esophageal reflux disease with esophagitis"),
}


# ── Tool: current datetime ─────────────────────────────────────────────────────

def get_current_datetime(timezone: str, tool_context: ToolContext) -> dict:
    """
    Returns the current date and time in the specified timezone.

    Args:
        timezone: IANA timezone string.  Examples: 'America/Chicago', 'UTC',
                  'America/New_York', 'Europe/London', 'Asia/Tokyo'.
                  Defaults to UTC if not provided.

    Returns a dict with date, time, day of week, and full ISO-8601 datetime.
    """
    tz_str = (timezone or "UTC").strip()
    logger.info("tool_get_current_datetime timezone=%s", tz_str)

    try:
        tz  = ZoneInfo(tz_str)
        now = datetime.now(tz)
        return {
            "status":      "success",
            "timezone":    tz_str,
            "datetime":    now.isoformat(),
            "date":        now.strftime("%Y-%m-%d"),
            "time":        now.strftime("%H:%M:%S"),
            "day_of_week": now.strftime("%A"),
        }
    except ZoneInfoNotFoundError:
        return {
            "status":        "error",
            "error_message": (
                f"Unknown timezone: '{tz_str}'. "
                "Use IANA format, e.g. 'America/Chicago', 'UTC', 'Europe/London'."
            ),
        }


# ── Tool: ICD-10 lookup ────────────────────────────────────────────────────────

def look_up_icd10(term: str, tool_context: ToolContext) -> dict:
    """
    Looks up the ICD-10-CM code for a common clinical condition.

    Args:
        term: Condition name to look up.  Examples: 'hypertension',
              'diabetes type 2', 'asthma', 'heart failure', 'copd'.

    Returns the ICD-10-CM code and full description if found.
    Falls back to a partial-match search if the exact term is not found.

    Note: This tool uses a small built-in reference table for demonstration.
    For production use, replace with a call to a terminology server such as
    NLM's VSAC or a FHIR ValueSet $expand endpoint.
    """
    raw  = (term or "").strip()
    key  = raw.lower()
    logger.info("tool_look_up_icd10 term=%s", raw)

    # Exact match
    if key in _ICD10_TABLE:
        code, description = _ICD10_TABLE[key]
        return {
            "status":      "success",
            "term":        raw,
            "icd10_code":  code,
            "description": description,
        }

    # Partial / substring match — return the first hit
    matches = [(k, v) for k, v in _ICD10_TABLE.items() if key in k or k in key]
    if matches:
        matched_key, (code, description) = matches[0]
        return {
            "status":       "success",
            "term":         raw,
            "matched_term": matched_key,
            "note":         "Exact match not found; showing closest match from built-in table.",
            "icd10_code":   code,
            "description":  description,
        }

    return {
        "status":          "not_found",
        "term":            raw,
        "error_message":   (
            f"No ICD-10 code found for '{raw}'. "
            "This tool uses a limited built-in table. "
            "Try: hypertension, diabetes type 2, asthma, copd, heart failure, "
            "atrial fibrillation, ckd, hyperlipidemia, depression, anxiety, "
            "obesity, hypothyroidism, osteoarthritis, gerd."
        ),
        "available_terms": sorted(_ICD10_TABLE.keys()),
    }
