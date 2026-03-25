#!/bin/bash
# SSOT lint — runs after Edit/Write on frontend src/ or backend ws/api/ files.
# Catches every bug class we've encountered. Returns JSON context to the model.

FILE="$1"
if [ -z "$FILE" ]; then
  INPUT=$(cat)
  FILE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path', d.get('tool_response',{}).get('filePath','')))" 2>/dev/null)
fi

[ -z "$FILE" ] && exit 0
echo "$FILE" | grep -qE '(frontend/src/|backend/ws/|backend/api/)' || exit 0

VIOLATIONS=""

# ── Frontend checks ──
if echo "$FILE" | grep -qE '\.(js|jsx|ts|tsx)$'; then

  # 1. Unsafe .conditions.map/length/filter — API may return {} instead of []
  UNSAFE_CONDS=$(grep -n '\.conditions\.\(map\|length\|filter\|forEach\|find\|some\|reduce\)' "$FILE" 2>/dev/null \
    | grep -v 'getConditions\|Array\.isArray\|// safe' | head -5)
  if [ -n "$UNSAFE_CONDS" ]; then
    VIOLATIONS="$VIOLATIONS\n[conditions] .conditions.map/length without getConditions() or Array.isArray:\n$UNSAFE_CONDS"
  fi

  # 2. getState() assigned to const in render body
  #    Skip: lines with // safe, // handler, // event, // callback, // effect
  #    Skip: inside arrow functions, .then(), async
  GETSTATE_UNSAFE=$(grep -n 'getState()' "$FILE" 2>/dev/null \
    | grep -v '// safe\|// handler\|// event\|// callback\|// effect' \
    | grep -v 'onClick\|onChange\|onSubmit\|onClose\|onComplete\|useEffect\|useCallback\|setTimeout\|\.then\|catch' \
    | grep -E '^\s*[0-9]+:\s*(const|let|var)\s' \
    | grep -v 'set[A-Z]\|clear[A-Z]\|add[A-Z]\|remove[A-Z]\|update[A-Z]\|dispatch\|send' | head -5)
  if [ -n "$GETSTATE_UNSAFE" ]; then
    VIOLATIONS="$VIOLATIONS\n[reactivity] getState() in render path — use useStore() selector:\n$GETSTATE_UNSAFE"
  fi

  # 3. Legacy currentLeP writes
  NEW_CURRENTLEP=$(grep -n 'currentLeP\s*=' "$FILE" 2>/dev/null \
    | grep -v '// legacy\|// compat\|currentLeP:\|\.currentLeP\|up\.current' | head -3)
  if [ -n "$NEW_CURRENTLEP" ]; then
    VIOLATIONS="$VIOLATIONS\n[legacy] Writing to currentLeP — use current_vitals:\n$NEW_CURRENTLEP"
  fi

  # 4. .map() on API fields that may not be array (without guard)
  UNSAFE_MAP=$(grep -n '\.\(basis_inventory\|spells\|liturgies\|special_abilities\|advantages\|disadvantages\)\.map\b' "$FILE" 2>/dev/null \
    | grep -v 'Array\.isArray\|\|\| \[\]\|// safe' | head -3)
  if [ -n "$UNSAFE_MAP" ]; then
    VIOLATIONS="$VIOLATIONS\n[type-safety] .map() on field that may not be array — add || [] guard:\n$UNSAFE_MAP"
  fi
fi

# ── Backend checks ──
if echo "$FILE" | grep -qE '\.py$'; then

  # 5. Bare asyncio.create_task (not inside _safe_create_task definition)
  BARE_TASK=$(grep -n 'asyncio\.create_task' "$FILE" 2>/dev/null \
    | grep -v '_safe_create_task\|# safe\|def _safe\|Wrapper around' | head -3)
  if [ -n "$BARE_TASK" ]; then
    VIOLATIONS="$VIOLATIONS\n[safety] Bare asyncio.create_task — use _safe_create_task:\n$BARE_TASK"
  fi

  # 6. _persist_ functions without per-entity lock
  HAS_PERSIST=$(grep -c 'async def _persist_' "$FILE" 2>/dev/null)
  if [ "$HAS_PERSIST" -gt 0 ]; then
    HAS_LOCK=$(grep -c '_get_char_lock\|async with.*lock' "$FILE" 2>/dev/null)
    if [ "$HAS_LOCK" -eq 0 ]; then
      VIOLATIONS="$VIOLATIONS\n[race] _persist_ functions without per-entity lock — use _get_char_lock()"
    fi
  fi
fi

# ── Report ──
if [ -n "$VIOLATIONS" ]; then
  echo -e "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"SSOT LINT VIOLATIONS in $FILE:\\n$VIOLATIONS\\n\\nFix these before proceeding. Use getConditions() from utils/safeData.js, useStore selectors, _safe_create_task, Array.isArray guards.\"}}"
  exit 0
fi
