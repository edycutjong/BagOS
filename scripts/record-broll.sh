#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# BagOS — Automated B-Roll Recorder
# Focuses Claude Desktop, types prompts with typewriter effect, and waits
# for responses. Start screen recording (⌘+Shift+5) BEFORE running this.
#
# Usage:
#   bash scripts/record-broll.sh          # Run all 7 Claude clips
#   bash scripts/record-broll.sh 2        # Run only clip #2 (heartbeat)
#   bash scripts/record-broll.sh 3 5      # Run clips 3 through 5
#
# Requires: Accessibility access for iTerm2/Terminal
#   System Settings → Privacy & Security → Accessibility → enable terminal
# ─────────────────────────────────────────────────────────────────────────────

# ─── Config ───────────────────────────────────────────────────────────────────
CHAR_DELAY=0.035        # Seconds between each character (typewriter speed)
PRE_ENTER_PAUSE=1.0     # Pause after typing before hitting Enter
RESPONSE_WAIT=12        # Seconds to wait for Claude to respond
BETWEEN_CLIPS=5         # Seconds between clips (for recording cuts)
CURSOR_BLINK_PAUSE=0.8  # Brief pause after focus before typing starts

# ─── Prompts for each B-roll clip ────────────────────────────────────────────
PROMPTS=(
  "Check the BagOS system status and give me a full health summary"
  "Show me the top 5 creators by lifetime fees on Bags"
  "Get me a trade quote for swapping 0.1 SOL to BOS tokens"
  "Give me detailed token analytics for the BOS token"
  "Authenticate my Solana wallet with BagOS"
  "Execute a trade of 0.1 SOL — show me the token gate in action"
  "Show all my claimable creator fees across Bags pools"
)

CLIP_NAMES=(
  "💓 Heartbeat & System Status"
  "🏆 Creator Leaderboard"
  "💱 Trade Quote"
  "📊 Token Analytics"
  "🔐 Wallet Authentication"
  "🔒 Token Gate (Access Denied)"
  "💰 Claimable Fees"
)

# ─── Typewriter function ─────────────────────────────────────────────────────
typewriter() {
  local text="$1"
  local delay="${2:-$CHAR_DELAY}"

  osascript <<EOF
tell application "System Events"
  tell process "Claude"
    set textToType to "$text"
    repeat with i from 1 to length of textToType
      keystroke (character i of textToType)
      delay $delay
    end repeat
  end tell
end tell
EOF
}

# ─── Submit (press Enter) ────────────────────────────────────────────────────
press_enter() {
  osascript -e '
tell application "System Events"
  tell process "Claude"
    keystroke return
  end tell
end tell
'
}

# ─── Focus Claude Desktop ────────────────────────────────────────────────────
focus_claude() {
  osascript -e 'tell application "Claude" to activate'
  sleep "$CURSOR_BLINK_PAUSE"
}

# ─── Notification beep ───────────────────────────────────────────────────────
beep() {
  afplay /System/Library/Sounds/Tink.aiff 2>/dev/null &
}

# ─── Countdown display ───────────────────────────────────────────────────────
countdown() {
  local secs=$1
  local label="${2:-Next clip in}"
  local c
  for ((c=secs; c>0; c--)); do
    printf "\r  ⏳ $label %ds...  " "$c"
    sleep 1
  done
  printf "\r                              \r"
}

# ─── Parse clip range ────────────────────────────────────────────────────────
if [ -z "$1" ]; then
  START_CLIP=1
  END_CLIP=${#PROMPTS[@]}
elif [ -z "$2" ]; then
  START_CLIP=$1
  END_CLIP=$1
else
  START_CLIP=$1
  END_CLIP=$2
fi

# Validate range
if [ "$START_CLIP" -lt 1 ] || [ "$START_CLIP" -gt "${#PROMPTS[@]}" ]; then
  echo "❌ Invalid start clip. Range: 1-${#PROMPTS[@]}"
  exit 1
fi
if [ "$END_CLIP" -lt "$START_CLIP" ] || [ "$END_CLIP" -gt "${#PROMPTS[@]}" ]; then
  END_CLIP="${#PROMPTS[@]}"
fi

# ─── Main ─────────────────────────────────────────────────────────────────────
TOTAL=$(( END_CLIP - START_CLIP + 1 ))

echo ""
echo "🎬 BagOS B-Roll Recorder"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Clips:       $START_CLIP → $END_CLIP ($TOTAL total)"
echo "  Type speed:  ${CHAR_DELAY}s/char"
echo "  Wait time:   ${RESPONSE_WAIT}s per response"
echo "  Gap between: ${BETWEEN_CLIPS}s"
echo ""
echo "⚠️  Start screen recording (⌘+Shift+5) NOW!"
echo ""

countdown 5 "Recording starts in"
echo ""

for ((i=START_CLIP-1; i<END_CLIP; i++)); do
  CLIP_NUM=$((i + 1))
  PROMPT="${PROMPTS[$i]}"
  NAME="${CLIP_NAMES[$i]}"

  echo "┌─────────────────────────────────────────────"
  echo "│ 🎬 Clip $CLIP_NUM/$END_CLIP — $NAME"
  echo "│ 💬 \"$PROMPT\""
  echo "└─────────────────────────────────────────────"

  # Focus Claude Desktop
  focus_claude

  # Type with typewriter effect
  echo "  ⌨️  Typing..."
  typewriter "$PROMPT"

  # Pause to let viewer read the prompt
  sleep "$PRE_ENTER_PAUSE"

  # Submit
  echo "  ⏎  Sending..."
  press_enter

  # Wait for response
  echo "  ⏳ Waiting ${RESPONSE_WAIT}s for response..."
  countdown "$RESPONSE_WAIT" "Response wait"

  beep
  echo "  ✅ Clip $CLIP_NUM done!"
  echo ""

  # Gap between clips (skip after last)
  if [ "$CLIP_NUM" -lt "$END_CLIP" ]; then
    countdown "$BETWEEN_CLIPS" "Next clip in"
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎬 All $TOTAL clips recorded!"
echo ""
echo "📝 Don't forget to also record:"
echo "   • Clip 0: Claude Desktop tool picker (manual — click the 🔧 icon)"
echo "   • Clip 8: Terminal golden path (run: npm run demo)"
echo ""
echo "🛑 Stop screen recording now (⌘+Shift+5)"
