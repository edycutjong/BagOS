"""
general_agent tools — re-exports all tool functions for this agent.

To add new tools:
  1. Create a new file here (e.g. notifications.py).
  2. Write your tool functions (last param must be tool_context: ToolContext).
  3. Import and re-export them below.
  4. Add them to the tools=[...] list in agent.py.

You can also import tools from shared/tools/ if this agent needs FHIR access.
"""

from .general import get_current_datetime, look_up_icd10

__all__ = [
    "get_current_datetime",
    "look_up_icd10",
]
