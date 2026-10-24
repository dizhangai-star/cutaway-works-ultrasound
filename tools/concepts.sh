#!/bin/zsh
# Target-frame concepts via codex-image (Codex CLI, ChatGPT login; never the API).
# Each direction: refs/concept/<dir>/prompt_v<V>.txt; shared refs/concept/style.md; layout ref refs/concept/fl3-20.jpg.
# Usage (from anywhere): zsh tools/concepts.sh [--series <png>] [--dark] <version> <dir>...
#   → refs/concept/<dir>/v<V>{a,b}.png (a light, b dark; with --dark both dark, the variations described in the prompt)
#   --series <png>: the previous episode's signed target (path relative to the film), sent as a second reference that
#                   fixes the series LOOK (colours, type, furniture, density); fl3-20 stays the layout reference.
CODEX=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
FILM=${0:A:h:h}
SERIES= DARK=
while [[ $1 == --* ]]; do
  case $1 in
    --series) SERIES=$2; shift 2 ;;
    --dark) DARK=1; shift ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
done
V=$1; shift
cd $FILM
REFS=(-i refs/concept/fl3-20.jpg)
REFTXT="refs/concept/fl3-20.jpg is a reference for LAYOUT, DENSITY and the plate format only; do not copy its text, subject, colours or brand."
if [[ -n $SERIES ]]; then
  REFS=(-i $SERIES $REFS)
  REFTXT="$SERIES is the SERIES LOOK to match (colours, type, furniture, density): keep it, change only the subject; $REFTXT"
fi
if [[ -n $DARK ]]; then VARS="variation a and variation b, both DARK, as described"; else VARS="variation a (LIGHT) and variation b (DARK) as described"; fi
for d in "$@"; do
  (
    P=refs/concept/$d
    echo "Use your image generation tool (image_gen). Do not write code, do not call any API with an API key.
Style lock: $(cat refs/concept/style.md)
Prompt: $(cat $P/prompt_v$V.txt)
Reference images: $REFTXT
Aspect: 16:10 landscape (e.g. 1536x960 or the closest landscape size you support).
Generate 2 images: $VARS, save as $P/v${V}a.png and $P/v${V}b.png. Reply only with the saved paths." |
    $CODEX exec --skip-git-repo-check --sandbox workspace-write -C "$FILM" $REFS - > $P/codex_v$V.log 2>&1
    echo "$d exit $?"
  ) &
done
wait
ls -la refs/concept/*/v$V*.png
