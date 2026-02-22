#!/usr/bin/env bash
set -euo pipefail
ROOT="$HOME/git/PS4"
APP_DB="$ROOT/app.db"
OUT="$ROOT/UPDATES_PENDING_LIST.md"

TMP_INST="/tmp/installed_appver.tsv"
find /Volumes/PS4 /Volumes/MagicLantern \
  \( -path "*/.Trashes/*" -o -path "*/.TemporaryItems/*" -o -path "*/.Spotlight-V100/*" -o -path "*/.fseventsd/*" -o -path "*/.DocumentRevisions-V100/*" \) -prune -o \
  -type f -iname "*.pkg" ! -name "._*" -print 2>/dev/null > /tmp/all_pkg_for_updates.txt || true

sqlite3 -separator $'\t' "$APP_DB" "
  SELECT b.titleId,
         b.titleName,
         IFNULL((SELECT val FROM tbl_appinfo ai WHERE ai.titleId=b.titleId AND ai.key='APP_VER' LIMIT 1), '00.00'),
         IFNULL((SELECT val FROM tbl_appinfo ai WHERE ai.titleId=b.titleId AND ai.key='VERSION' LIMIT 1), '00.00')
  FROM tbl_appbrowse_0507646227 b
  WHERE b.titleId LIKE 'CUSA%'
    AND b.category LIKE 'gd%'
    AND IFNULL(b.titleName,'')<>''
    AND IFNULL(b.contentSize,0)>0;
" > "$TMP_INST"

declare -A TITLE
declare -A INST_VER

ver_to_int() {
  local v="$1"
  if [[ "$v" =~ ^([0-9]{1,2})\.([0-9]{1,2})$ ]]; then
    printf "%d" "$((10#${BASH_REMATCH[1]}*100 + 10#${BASH_REMATCH[2]}))"
  else
    printf "0"
  fi
}

pick_installed_ver() {
  local appv="$1" pkgv="$2"
  local ai vi
  ai="$(ver_to_int "$appv")"
  vi="$(ver_to_int "$pkgv")"
  if (( ai >= vi )); then
    printf "%s" "${appv:-00.00}"
  else
    printf "%s" "${pkgv:-00.00}"
  fi
}

while IFS=$'\t' read -r tid tname appv pkgv; do
  [[ -z "$tid" ]] && continue
  TITLE["$tid"]="$tname"
  INST_VER["$tid"]="$(pick_installed_ver "$appv" "$pkgv")"
done < "$TMP_INST"

declare -A BEST_VER
declare -A BEST_VER_INT
declare -A BEST_FILE
declare -A BEST_PATH

while IFS= read -r p; do
  bn="$(basename "$p")"
  low="$(echo "$bn" | tr '[:upper:]' '[:lower:]')"

  # only update-like packages
  if [[ ! "$low" =~ update|patch|optionalfix|backport ]] && [[ ! "$low" =~ -a01[0-9]{2}- ]]; then
    continue
  fi
  # skip likely base version marker
  if [[ "$low" =~ -a0100- ]] && [[ ! "$low" =~ update|patch|optionalfix|backport ]]; then
    continue
  fi

  cusa="$(echo "$bn" | rg -o 'CUSA[0-9]{5}' -m 1 || true)"
  [[ -z "$cusa" ]] && continue
  [[ -z "${INST_VER[$cusa]:-}" ]] && continue

  avail=""
  if [[ "$low" =~ v([0-9]+)\.([0-9]{1,2}) ]]; then
    avail="$(printf "%02d.%02d" "$((10#${BASH_REMATCH[1]}))" "$((10#${BASH_REMATCH[2]}))")"
  elif [[ "$low" =~ updatev([0-9]+)\.([0-9]{1,2}) ]]; then
    avail="$(printf "%02d.%02d" "$((10#${BASH_REMATCH[1]}))" "$((10#${BASH_REMATCH[2]}))")"
  elif [[ "$low" =~ -a01([0-9]{2})- ]]; then
    avail="01.${BASH_REMATCH[1]}"
  fi

  [[ -z "$avail" ]] && continue

  ai="$(ver_to_int "$avail")"
  bi="${BEST_VER_INT[$cusa]:-0}"
  if (( ai > bi )); then
    BEST_VER_INT["$cusa"]="$ai"
    BEST_VER["$cusa"]="$avail"
    BEST_FILE["$cusa"]="$bn"
    BEST_PATH["$cusa"]="$p"
  fi
done < /tmp/all_pkg_for_updates.txt

{
  echo "# PS4 Updates Pending"
  echo
  echo "- Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- Logic: compares installed effective version (max of APP_VER and VERSION from \`app.db\`) vs highest update version found in external update PKGs"
  echo
  echo "| Title | Title ID | Installed Ver | Highest Update Found | Gap | Update File | Path |"
  echo "|---|---|---:|---:|---:|---|---|"

  for cusa in "${!BEST_VER[@]}"; do
    inst="${INST_VER[$cusa]}"
    inst_i="$(ver_to_int "$inst")"
    best_i="${BEST_VER_INT[$cusa]}"
    if (( best_i > inst_i )); then
      gap="$(printf "%.2f" "$(awk "BEGIN {print ($best_i-$inst_i)/100}")")"
      printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
        "${TITLE[$cusa]}" "$cusa" "$inst" "${BEST_VER[$cusa]}" "$gap" "${BEST_FILE[$cusa]}" "${BEST_PATH[$cusa]}"
    fi
  done | sort -f | awk -F '\t' '{for(i=1;i<=7;i++) gsub(/\|/, "\\|", $i); printf "| %s | %s | %s | %s | %s | %s | `%s` |\n", $1,$2,$3,$4,$5,$6,$7}'
} > "$OUT"

ls -lh "$OUT"
