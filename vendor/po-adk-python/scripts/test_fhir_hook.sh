#!/usr/bin/env bash
# test_fhir_hook.sh — end-to-end test for the healthcare FHIR agent
#
# Exercises the full request pipeline: API key enforcement → FHIR metadata
# extraction → session state → tool calls.
#
# Usage:
#   ./scripts/test_fhir_hook.sh                        # uses http://127.0.0.1:8001
#   ./scripts/test_fhir_hook.sh http://my-host:8001    # custom host
#   API_KEY=my-key ./scripts/test_fhir_hook.sh         # custom API key
#
# Run the server first:
#   uvicorn healthcare_agent.app:a2a_app --host 127.0.0.1 --port 8001 --log-level info
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8001}"
RPC_URL="${BASE_URL%/}/"
API_KEY="${API_KEY:-my-secret-key-123}"

post_json() {
  local label="$1"
  local with_key="$2"
  local payload="$3"

  echo
  echo "===== ${label} ====="
  if [[ "$with_key" == "yes" ]]; then
    curl -sS -i -X POST "$RPC_URL" \
      -H 'Content-Type: application/json' \
      -H "X-API-Key: ${API_KEY}" \
      --data "$payload"
  else
    curl -sS -i -X POST "$RPC_URL" \
      -H 'Content-Type: application/json' \
      --data "$payload"
  fi
  echo
}

# ── Payloads ───────────────────────────────────────────────────────────────────

# Case A / B — no FHIR metadata at all.
# The agent will respond explaining that FHIR context is missing.
payload_no_metadata='{
  "jsonrpc": "2.0",
  "id": "case-b",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "message_id": "case-b-message",
      "role": "user",
      "parts": [
        {"kind": "text", "text": "What medications is this patient currently taking?"}
      ]
    }
  }
}'

# Case C — metadata present but under the wrong key (not the registered extension URI).
# Hook will not find FHIR data; tools will return a missing-context error.
payload_wrong_key='{
  "jsonrpc": "2.0",
  "id": "case-c",
  "method": "message/send",
  "params": {
    "metadata": {
      "custom-context": {
        "fhirUrl": "https://fhir.example.org/r4",
        "fhirToken": "token-should-not-be-used",
        "patientId": "patient-wrong-key"
      }
    },
    "message": {
      "kind": "message",
      "message_id": "case-c-message",
      "role": "user",
      "parts": [
        {"kind": "text", "text": "What are this patient'\''s active conditions?"}
      ]
    }
  }
}'

# Case D — valid API key + correctly keyed FHIR metadata.
# The hook extracts credentials, stores them in session state, and the tools
# can call the FHIR server.  Point fhirUrl at a real R4 endpoint to get live data.
payload_valid_fhir='{
  "jsonrpc": "2.0",
  "id": "case-d",
  "method": "message/send",
  "params": {
    "metadata": {
      "http://localhost:5139/schemas/a2a/v1/fhir-context": {
        "fhirUrl": "https://fhir.example.org/r4",
        "fhirToken": "token-sensitive-123456",
        "patientId": "patient-42"
      }
    },
    "message": {
      "kind": "message",
      "message_id": "case-d-message",
      "role": "user",
      "parts": [
        {"kind": "text", "text": "Give me a clinical summary for this patient — demographics, active conditions, and current medications."}
      ]
    }
  }
}'

# Case D2 — a more targeted clinical query using the same valid FHIR context.
payload_vitals='{
  "jsonrpc": "2.0",
  "id": "case-d2",
  "method": "message/send",
  "params": {
    "metadata": {
      "http://localhost:5139/schemas/a2a/v1/fhir-context": {
        "fhirUrl": "https://fhir.example.org/r4",
        "fhirToken": "token-sensitive-123456",
        "patientId": "patient-42"
      }
    },
    "message": {
      "kind": "message",
      "message_id": "case-d2-message",
      "role": "user",
      "parts": [
        {"kind": "text", "text": "What are the most recent vital signs for this patient?"}
      ]
    }
  }
}'

# Case E — malformed FHIR payload (string instead of JSON object).
# The hook should log hook_called_fhir_malformed and tools return a context error.
payload_malformed_fhir='{
  "jsonrpc": "2.0",
  "id": "case-e",
  "method": "message/send",
  "params": {
    "metadata": {
      "http://localhost:5139/schemas/a2a/v1/fhir-context": "this-is-not-a-json-object"
    },
    "message": {
      "kind": "message",
      "message_id": "case-e-message",
      "role": "user",
      "parts": [
        {"kind": "text", "text": "What lab results are available for this patient?"}
      ]
    }
  }
}'

# ── Run tests ──────────────────────────────────────────────────────────────────

echo "Target RPC endpoint: ${RPC_URL}"
echo "Using API key prefix: ${API_KEY:0:6}..."
echo "Run your server separately, for example:"
echo "  uvicorn healthcare_agent.app:a2a_app --host 127.0.0.1 --port 8001 --log-level info"

# Case A: no API key → 401, pipeline never reaches the agent
post_json "Case A - Missing API key (expect 401)" "no" "$payload_no_metadata"

# Case B: valid key, no FHIR metadata → hook finds nothing, tools return missing-context error
post_json "Case B - Valid key + no FHIR metadata (expect hook_called_no_metadata)" "yes" "$payload_no_metadata"

# Case C: valid key, wrong metadata key → hook finds nothing, tools return missing-context error
post_json "Case C - Valid key + wrong metadata key (expect hook_called_fhir_not_found)" "yes" "$payload_wrong_key"

# Case D: valid key + correct FHIR metadata → full clinical summary
post_json "Case D - Valid key + FHIR context: clinical summary (expect hook_called_fhir_found + patient-42 in tool logs)" "yes" "$payload_valid_fhir"

# Case D2: valid key + correct FHIR metadata → targeted vital-signs query
post_json "Case D2 - Valid key + FHIR context: vital signs (expect get_recent_observations called)" "yes" "$payload_vitals"

# Case E: malformed FHIR payload → hook logs malformed, tools return context error
post_json "Case E - Valid key + malformed FHIR metadata (expect hook_called_fhir_malformed)" "yes" "$payload_malformed_fhir"

echo
echo "Expected server log markers to verify in your terminal:"
echo "  security_rejected_missing_api_key      (Case A)"
echo "  hook_called_no_metadata                (Case B)"
echo "  hook_called_fhir_not_found             (Case C)"
echo "  hook_called_fhir_found                 (Cases D, D2)"
echo "  FHIR_PATIENT_FOUND value=patient-42    (Cases D, D2)"
echo "  tool_get_patient_demographics          (Case D)"
echo "  tool_get_active_conditions             (Case D)"
echo "  tool_get_active_medications            (Case D)"
echo "  tool_get_recent_observations           (Case D2)"
echo "  hook_called_fhir_malformed             (Case E)"
