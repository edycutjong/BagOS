#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# BagOS — Recording Window Setup
# Positions Claude Desktop and Terminal for clean B-roll capture.
# Usage: bash scripts/setup-recording.sh [480p|640p|720p|1080p|800]
#
# NOTE: Claude Desktop is an Electron app — standard AppleScript `bounds`
# doesn't work. We use System Events (position + size) instead.
# Requires: System Preferences → Privacy → Accessibility → Terminal ✅
# ─────────────────────────────────────────────────────────────────────────────

PRESET="${1:-800}"

echo "🎬 BagOS Recording Setup — Preset: $PRESET"
echo ""

# Format: X Y WIDTH HEIGHT
case "$PRESET" in
  480p)
    CLAUDE_X=533; CLAUDE_Y=300; CLAUDE_W=854;  CLAUDE_H=480
    TERM_X=573;   TERM_Y=340;   TERM_W=774;    TERM_H=400
    ;;
  640p)
    CLAUDE_X=392; CLAUDE_Y=220; CLAUDE_W=1136; CLAUDE_H=640
    TERM_X=432;   TERM_Y=270;   TERM_W=1056;   TERM_H=540
    ;;
  720p)
    CLAUDE_X=320; CLAUDE_Y=180; CLAUDE_W=1280; CLAUDE_H=720
    TERM_X=400;   TERM_Y=250;   TERM_W=1120;   TERM_H=580
    ;;
  1080p)
    CLAUDE_X=0;   CLAUDE_Y=25;  CLAUDE_W=1920; CLAUDE_H=1080
    TERM_X=0;     TERM_Y=25;    TERM_W=1920;   TERM_H=1080
    ;;
  800|*)
    CLAUDE_X=320; CLAUDE_Y=100; CLAUDE_W=1280; CLAUDE_H=800
    TERM_X=360;   TERM_Y=140;   TERM_W=1200;   TERM_H=720
    ;;
esac

# ─── Position Claude Desktop (Electron — needs System Events) ────────────────
osascript <<EOF 2>/dev/null
tell application "Claude" to activate
delay 0.5
tell application "System Events"
  tell process "Claude"
    if (count of windows) > 0 then
      set position of front window to {${CLAUDE_X}, ${CLAUDE_Y}}
      set size of front window to {${CLAUDE_W}, ${CLAUDE_H}}
    end if
  end tell
end tell
EOF

if [ $? -eq 0 ]; then
  echo "✅ Claude Desktop → ${CLAUDE_W}×${CLAUDE_H} at (${CLAUDE_X}, ${CLAUDE_Y})"
else
  echo "⚠️  Claude Desktop — grant Accessibility access to your terminal:"
  echo "   System Settings → Privacy & Security → Accessibility → enable iTerm2/Terminal"
fi

# ─── Position Terminal (iTerm2 or Terminal.app — standard AppleScript works) ──
osascript -e "
tell application \"iTerm2\"
  activate
  delay 0.3
  set bounds of front window to {${TERM_X}, ${TERM_Y}, $((TERM_X + TERM_W)), $((TERM_Y + TERM_H))}
end tell
" 2>/dev/null && echo "✅ iTerm2 → ${TERM_W}×${TERM_H} at (${TERM_X}, ${TERM_Y})" || {
  osascript -e "
  tell application \"Terminal\"
    activate
    delay 0.3
    set bounds of front window to {${TERM_X}, ${TERM_Y}, $((TERM_X + TERM_W)), $((TERM_Y + TERM_H))}
  end tell
  " 2>/dev/null && echo "✅ Terminal → ${TERM_W}×${TERM_H} at (${TERM_X}, ${TERM_Y})" || echo "⚠️  No terminal app found"
}

echo ""
echo "📹 Ready! Use ⌘+Shift+5 to start recording."
echo ""
echo "Shot list:"
echo "  1. Claude Desktop — Tool Discovery (show 10 BagOS tools)"
echo "  2. Claude Desktop — Heartbeat (type: check system status)"
echo "  3. Claude Desktop — Auth (type: authenticate my wallet)"
echo "  4. Claude Desktop — Creators (type: show top creators)"
echo "  5. Claude Desktop — Trade Quote (type: quote 0.1 SOL to BOS)"
echo "  6. Claude Desktop — Token Gate (type: execute a trade)"
echo "  7. Claude Desktop — Claim Fees (type: show claimable fees)"
echo "  8. Terminal — Golden Path (run: npm run demo)"
