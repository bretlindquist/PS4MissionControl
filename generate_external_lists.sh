#!/usr/bin/env bash
set -euo pipefail
ROOT="$HOME/git/PS4"
OUT_GAMES="$ROOT/EXTERNAL_GAMES_LIST.md"
OUT_THEMES="$ROOT/EXTERNAL_THEMES_LIST.md"
OUT_NON="$ROOT/EXTERNAL_NON_GAMES_LIST.md"
OUT_DLC="$ROOT/EXTERNAL_DLC_LIST.md"
OUT_ARCHIVE="$ROOT/EXTERNAL_ARCHIVES_REVIEW.md"

TMP_GAMES_PKG="/tmp/ext_games_pkg.tsv"
TMP_GAMES_ARC="/tmp/ext_games_arc.tsv"
TMP_DLC_PKG="/tmp/ext_dlc_pkg.tsv"
TMP_DLC_ARC="/tmp/ext_dlc_arc.tsv"
TMP_THEME_PKG="/tmp/ext_theme_pkg.tsv"
TMP_THEME_ARC="/tmp/ext_theme_arc.tsv"
TMP_NON_PKG="/tmp/ext_non_pkg.tsv"
TMP_NON_ARC="/tmp/ext_non_arc.tsv"
TMP_ALL_ARC="/tmp/ext_all_arc.tsv"

find /Volumes/PS4 /Volumes/MagicLantern \
  \( -path "*/.Trashes/*" -o -path "*/.TemporaryItems/*" -o -path "*/.Spotlight-V100/*" -o -path "*/.fseventsd/*" -o -path "*/.DocumentRevisions-V100/*" \) -prune -o \
  -type f \( -iname "*.pkg" \) ! -name "._*" -print 2>/dev/null > /tmp/all_pkg_paths.txt || true
find /Volumes/PS4 /Volumes/MagicLantern \
  \( -path "*/.Trashes/*" -o -path "*/.TemporaryItems/*" -o -path "*/.Spotlight-V100/*" -o -path "*/.fseventsd/*" -o -path "*/.DocumentRevisions-V100/*" \) -prune -o \
  -type f \( -iname "*.rar" -o -iname "*.zip" -o -iname "*.7z" -o -iname "*.001" \) ! -name "._*" -print 2>/dev/null > /tmp/all_arc_paths.txt || true

is_dlc_name() {
  local l
  l="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$l" == *"dlc"* ]] || [[ "$l" == *"addon"* ]] || [[ "$l" == *"add-on"* ]] || [[ "$l" == *"season pass"* ]] || [[ "$l" == *"story expansion"* ]] || [[ "$l" == *"pack"* ]]
}

is_theme_name() {
  local l
  l="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$l" == *"theme"* ]] || [[ "$l" == *"dynamic_"* ]] || [[ "$l" == *"dynamic "* ]]
}

is_non_game_name() {
  local l
  l="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  is_dlc_name "$1" && return 0
  [[ "$l" == *"unlocker"* ]] && return 0
  [[ "$l" == *"avatar"* ]] && return 0
  [[ "$l" == *"demo"* ]] && return 0
  [[ "$l" == *"fix"* ]] && return 0
  [[ "$l" == *"backport"* ]] && return 0
  [[ "$l" == *"optionalfix"* ]] && return 0
  [[ "$l" == *"patch"* ]] && return 0
  [[ "$l" == *"update"* ]] && return 0
  [[ "$l" =~ -a01[0-9]{2}- ]] && [[ "$l" != *"-a0100-"* ]] && return 0
  return 1
}

: > "$TMP_GAMES_PKG"; : > "$TMP_GAMES_ARC"; : > "$TMP_DLC_PKG"; : > "$TMP_DLC_ARC"; : > "$TMP_THEME_PKG"; : > "$TMP_THEME_ARC"; : > "$TMP_NON_PKG"; : > "$TMP_NON_ARC"; : > "$TMP_ALL_ARC"

while IFS= read -r p; do
  bn="$(basename "$p")"
  drive="$(echo "$p" | awk -F/ '{print $3}')"
  size="$(stat -f %z "$p" 2>/dev/null || echo 0)"
  mtime="$(stat -f "%Sm" -t "%Y-%m-%d" "$p" 2>/dev/null || echo "")"
  cusa="$(echo "$bn" | rg -o 'CUSA[0-9]{5}' -m 1 || true)"
  row="$drive\t$bn\t$cusa\t$size\t$mtime\t$p"

  if is_theme_name "$bn"; then
    printf "%b\n" "$row" >> "$TMP_THEME_PKG"
  elif is_dlc_name "$bn"; then
    printf "%b\n" "$row" >> "$TMP_DLC_PKG"
  elif is_non_game_name "$bn"; then
    printf "%b\n" "$row" >> "$TMP_NON_PKG"
  else
    printf "%b\n" "$row" >> "$TMP_GAMES_PKG"
  fi
done < /tmp/all_pkg_paths.txt

while IFS= read -r a; do
  bn="$(basename "$a")"
  low="$(echo "$a" | tr '[:upper:]' '[:lower:]')"
  if [[ ! "$low" =~ ps4|cusa|\.pkg|duplex|opoisso|backport ]]; then
    continue
  fi
  drive="$(echo "$a" | awk -F/ '{print $3}')"
  size="$(stat -f %z "$a" 2>/dev/null || echo 0)"
  mtime="$(stat -f "%Sm" -t "%Y-%m-%d" "$a" 2>/dev/null || echo "")"
  cusa="$(echo "$bn" | rg -o 'CUSA[0-9]{5}' -m 1 || true)"
  dir="$(dirname "$a")"
  extract_status="needs_check"
  if [[ -n "$cusa" ]]; then
    if find "$dir" -maxdepth 1 -type f -iname "*${cusa}*.pkg" | grep -q .; then extract_status="likely_extracted"; else extract_status="likely_needs_extraction"; fi
  else
    stem="${bn%.*}"; stem="${stem%.part*}"
    if find "$dir" -maxdepth 1 -type f -iname "${stem}*.pkg" | grep -q .; then extract_status="likely_extracted"; else extract_status="likely_needs_extraction"; fi
  fi

  if is_theme_name "$bn"; then
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$drive" "$bn" "$cusa" "$size" "$mtime" "$extract_status" "$a" >> "$TMP_THEME_ARC"
    printf "theme\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$drive" "$bn" "$cusa" "$size" "$mtime" "$extract_status" "$a" >> "$TMP_ALL_ARC"
  elif is_dlc_name "$bn"; then
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$drive" "$bn" "$cusa" "$size" "$mtime" "$extract_status" "$a" >> "$TMP_DLC_ARC"
    printf "dlc\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$drive" "$bn" "$cusa" "$size" "$mtime" "$extract_status" "$a" >> "$TMP_ALL_ARC"
  elif is_non_game_name "$bn"; then
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$drive" "$bn" "$cusa" "$size" "$mtime" "$extract_status" "$a" >> "$TMP_NON_ARC"
    printf "non_game\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$drive" "$bn" "$cusa" "$size" "$mtime" "$extract_status" "$a" >> "$TMP_ALL_ARC"
  else
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$drive" "$bn" "$cusa" "$size" "$mtime" "$extract_status" "$a" >> "$TMP_GAMES_ARC"
    printf "game\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$drive" "$bn" "$cusa" "$size" "$mtime" "$extract_status" "$a" >> "$TMP_ALL_ARC"
  fi
done < /tmp/all_arc_paths.txt

render_pkg_table() {
  local file="$1"
  sort -f "$file" | awk -F '\t' 'NF>=6{printf "| %s | %s | %s | %.2f | %s | `%s` |\n", $1, $2, ($3==""?"-":$3), $4/1024/1024/1024, $5, $6}'
}

render_arc_table() {
  local file="$1"
  sort -f "$file" | awk -F '\t' 'NF>=7{printf "| %s | %s | %s | %.2f | %s | %s | `%s` |\n", $1, $2, ($3==""?"-":$3), $4/1024/1024/1024, $5, $6, $7}'
}

{
  echo "# External PS4 Games List"
  echo
  echo "- Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- Drives scanned: \`/Volumes/PS4\`, \`/Volumes/MagicLantern\`"
  echo "- Game PKGs detected: $(wc -l < "$TMP_GAMES_PKG" | tr -d ' ')"
  echo "- Game archives detected: $(wc -l < "$TMP_GAMES_ARC" | tr -d ' ')"
  echo
  echo "## Game PKGs"
  echo "| Drive | File | CUSA | Size (GB) | Date | Path |"
  echo "|---|---|---|---:|---|---|"
  render_pkg_table "$TMP_GAMES_PKG"
  echo
  echo "## Game Archives (RAR/ZIP/7z/001)"
  echo "| Drive | Archive | CUSA | Size (GB) | Date | Status | Path |"
  echo "|---|---|---|---:|---|---|---|"
  render_arc_table "$TMP_GAMES_ARC"
} > "$OUT_GAMES"

{
  echo "# External PS4 DLC List"
  echo
  echo "- Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- DLC PKGs detected: $(wc -l < "$TMP_DLC_PKG" | tr -d ' ')"
  echo "- DLC archives detected: $(wc -l < "$TMP_DLC_ARC" | tr -d ' ')"
  echo
  echo "## DLC PKGs"
  echo "| Drive | File | CUSA | Size (GB) | Date | Path |"
  echo "|---|---|---|---:|---|---|"
  render_pkg_table "$TMP_DLC_PKG"
  echo
  echo "## DLC Archives (RAR/ZIP/7z/001)"
  echo "| Drive | Archive | CUSA | Size (GB) | Date | Status | Path |"
  echo "|---|---|---|---:|---|---|---|"
  render_arc_table "$TMP_DLC_ARC"
} > "$OUT_DLC"

{
  echo "# External PS4 Themes List"
  echo
  echo "- Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- Theme PKGs detected: $(wc -l < "$TMP_THEME_PKG" | tr -d ' ')"
  echo "- Theme archives detected: $(wc -l < "$TMP_THEME_ARC" | tr -d ' ')"
  echo
  echo "## Theme PKGs"
  echo "| Drive | File | CUSA | Size (GB) | Date | Path |"
  echo "|---|---|---|---:|---|---|"
  render_pkg_table "$TMP_THEME_PKG"
  echo
  echo "## Theme Archives (RAR/ZIP/7z/001)"
  echo "| Drive | Archive | CUSA | Size (GB) | Date | Status | Path |"
  echo "|---|---|---|---:|---|---|---|"
  render_arc_table "$TMP_THEME_ARC"
} > "$OUT_THEMES"

{
  echo "# External PS4 Non-Games List"
  echo
  echo "- Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- Non-game PKGs detected: $(wc -l < "$TMP_NON_PKG" | tr -d ' ')"
  echo "- Non-game archives detected: $(wc -l < "$TMP_NON_ARC" | tr -d ' ')"
  echo
  echo "## Non-Game PKGs"
  echo "| Drive | File | CUSA | Size (GB) | Date | Path |"
  echo "|---|---|---|---:|---|---|"
  render_pkg_table "$TMP_NON_PKG"
  echo
  echo "## Non-Game Archives (RAR/ZIP/7z/001)"
  echo "| Drive | Archive | CUSA | Size (GB) | Date | Status | Path |"
  echo "|---|---|---|---:|---|---|---|"
  render_arc_table "$TMP_NON_ARC"
} > "$OUT_NON"

{
  echo "# External PS4 Archives Review"
  echo
  echo "- Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- Rule: archives with status \`likely_extracted\` are likely safe to delete."
  echo "- Verify manually before deleting."
  echo
  echo "## Likely Safe To Delete (Already Extracted)"
  echo "| Category | Drive | Archive | CUSA | Size (GB) | Date | Status | Path |"
  echo "|---|---|---|---|---:|---|---|---|"
  sort -f "$TMP_ALL_ARC" | awk -F '\t' '$7=="likely_extracted"{printf "| %s | %s | %s | %s | %.2f | %s | %s | `%s` |\n",$1,$2,$3,($4==""?"-":$4),$5/1024/1024/1024,$6,$7,$8}'
  echo
  echo "## Keep For Now (Needs Extraction/Check)"
  echo "| Category | Drive | Archive | CUSA | Size (GB) | Date | Status | Path |"
  echo "|---|---|---|---|---:|---|---|---|"
  sort -f "$TMP_ALL_ARC" | awk -F '\t' '$7!="likely_extracted"{printf "| %s | %s | %s | %s | %.2f | %s | %s | `%s` |\n",$1,$2,$3,($4==""?"-":$4),$5/1024/1024/1024,$6,$7,$8}'
} > "$OUT_ARCHIVE"

ls -lh "$OUT_GAMES" "$OUT_DLC" "$OUT_THEMES" "$OUT_NON" "$OUT_ARCHIVE"
