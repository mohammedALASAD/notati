#!/bin/bash
#
# Downloads the Notati sales workbook and drops it where you want it — Desktop,
# or an iCloud Drive folder so it reaches your iPhone and iPad too.
#
# The admin password is read from the macOS Keychain, never stored in this file.
# Set it up once with tools/install-sync.sh.
#
# Run by hand any time:   tools/notati-sync.sh
# Or let launchd run it:  see install-sync.sh
#
set -euo pipefail

API="${NOTATI_API:-https://api.notati.app/api}"
EMAIL="${NOTATI_EMAIL:-admin@notati.com}"
DEST="${NOTATI_DEST:-$HOME/Desktop/Notati sales.xlsx}"
KEYCHAIN_SERVICE="notati-sync"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

PASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$EMAIL" -w 2>/dev/null)" \
  || die "No password in the Keychain for $EMAIL. Run tools/install-sync.sh first."

log "Signing in as $EMAIL"
TOKEN="$(curl -fsS -X POST "$API/auth/login/" \
  -H 'Content-Type: application/json' \
  --data "$(printf '{"email":%s,"password":%s}' \
            "$(printf '%s' "$EMAIL"    | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" \
            "$(printf '%s' "$PASSWORD" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')")" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin).get("access",""))')" \
  || die "Login failed. Check the password in the Keychain, or that the site is up."

[ -n "$TOKEN" ] || die "Login returned no token."

# Write to a temporary file first and move it into place only once the download
# has fully succeeded — so a dropped connection can never leave you with a
# half-written workbook, and Numbers never opens one mid-write.
TMP="$(mktemp "${TMPDIR:-/tmp}/notati-sales.XXXXXX.xlsx")"
trap 'rm -f "$TMP"' EXIT

log "Downloading the workbook"
curl -fsS "$API/admin/sales-workbook/" -H "Authorization: Bearer $TOKEN" -o "$TMP" \
  || die "Download failed."

# An .xlsx is a zip: if the first bytes aren't PK we got an error page, not a file.
head -c 2 "$TMP" | grep -q 'PK' || die "That wasn't a spreadsheet — the server returned an error."

mkdir -p "$(dirname "$DEST")"
mv -f "$TMP" "$DEST"
trap - EXIT

log "Saved to $DEST ($(du -h "$DEST" | cut -f1))"
