#!/usr/bin/env bash
set -euo pipefail
ROOT="$HOME/git/PS4"
APP_DB="$ROOT/app.db"
ADDCONT_DB="$ROOT/addcont.db"
OUT_GAMES="$ROOT/GAMES_LIST.md"
OUT_DLC="$ROOT/INSTALLED_DLC_LIST.md"

COUNT_GAMES=$(sqlite3 "$APP_DB" "SELECT COUNT(*) FROM tbl_appbrowse_0507646227 b WHERE b.titleId LIKE 'CUSA%' AND b.category LIKE 'gd%' AND IFNULL(b.titleName,'')<>'' AND IFNULL(b.contentSize,0)>0;")
{
  echo "# PS4 Installed Games"
  echo
  echo "- Source: \`$APP_DB\`"
  echo "- Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- Rule: titleId starts with CUSA, category starts with gd, and contentSize > 0"
  echo "- Total games: $COUNT_GAMES"
  echo
  echo "| Title | Title ID | Current Ver | Last Played | Installed Size (GB) | Size Tier | Folder | Content ID | UI Category |"
  echo "|---|---|---|---|---:|---|---|---|---|"
  sqlite3 -separator $'\t' "$APP_DB" "
    SELECT b.titleName, b.titleId,
           IFNULL((SELECT val FROM tbl_appinfo ai WHERE ai.titleId=b.titleId AND ai.key='APP_VER' LIMIT 1), ''),
           IFNULL((SELECT val FROM tbl_appinfo ai WHERE ai.titleId=b.titleId AND ai.key='VERSION' LIMIT 1), ''),
           IFNULL(b.lastAccessTime,''),
           IFNULL(b.contentSize,0),
           IFNULL(f.titleName,''),
           IFNULL(b.contentId,''),
           IFNULL(b.uiCategory,'')
    FROM tbl_appbrowse_0507646227 b
    LEFT JOIN tbl_appbrowse_0507646226 bcat ON bcat.titleId=b.titleId
    LEFT JOIN tbl_appbrowse_0507646226 f ON f.titleId=bcat.parentFolderId AND f.folderType=1
    WHERE b.titleId LIKE 'CUSA%' AND b.category LIKE 'gd%' AND IFNULL(b.titleName,'')<>'' AND IFNULL(b.contentSize,0)>0
    ORDER BY lower(b.titleName), b.titleId;
  " | awk -F '\t' '
    function ver_to_int(v, parts, n) {
      n=split(v, parts, ".")
      if (n == 2 && parts[1] ~ /^[0-9]+$/ && parts[2] ~ /^[0-9]+$/) return (parts[1]+0)*100 + (parts[2]+0)
      return 0
    }
    function size_tier(gb) {
      if (gb >= 50) return "Huge"
      if (gb >= 20) return "Large"
      if (gb >= 5) return "Medium"
      if (gb >= 1) return "Small"
      return "Tiny"
    }
    {
      for(i=1;i<=9;i++) gsub(/\|/, "\\|", $i)
      appv=$3
      ver=$4
      appi=ver_to_int(appv)
      veri=ver_to_int(ver)
      cur=(appi >= veri ? appv : ver)
      if (cur == "") cur = (appv != "" ? appv : (ver != "" ? ver : "00.00"))
      last=$5
      if (last == "") last = "-"
      szb=$6+0
      gb=szb/1073741824
      printf("| %s | %s | %s | %s | %.2f | %s | %s | %s | %s |\n",
        $1,$2,cur,last,gb,size_tier(gb),$7,$8,$9)
    }'
} > "$OUT_GAMES"

COUNT_DLC=$(sqlite3 "$ADDCONT_DB" "SELECT COUNT(*) FROM addcont;")
{
  echo "# PS4 Installed DLC"
  echo
  echo "- Source: \`$ADDCONT_DB\`"
  echo "- Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- Total DLC entries: $COUNT_DLC"
  echo
  echo "| DLC Title | Base Title ID | Content ID | Dir Name | Attribute Ver | Version Raw | Status |"
  echo "|---|---|---|---|---|---:|---:|"
  sqlite3 -separator $'\t' "$ADDCONT_DB" "
    SELECT
      IFNULL(NULLIF(titles_ENGLISH_US,''), IFNULL(NULLIF(title,''), '[No title]')),
      IFNULL(title_id,''),
      IFNULL(content_id,''),
      IFNULL(dir_name,''),
      IFNULL(attribute,''),
      IFNULL(version,0),
      IFNULL(status,0)
    FROM addcont
    ORDER BY lower(IFNULL(NULLIF(titles_ENGLISH_US,''), IFNULL(NULLIF(title,''), 'zzz'))), content_id;
  " | awk -F '\t' '{for(i=1;i<=7;i++) gsub(/\|/, "\\|", $i); printf("| %s | %s | %s | %s | %s | %s | %s |\n", $1,$2,$3,$4,$5,$6,$7)}'
} > "$OUT_DLC"

ls -lh "$OUT_GAMES" "$OUT_DLC"
