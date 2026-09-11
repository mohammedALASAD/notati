#!/bin/bash
#
# One-time setup so the Notati sales workbook keeps itself up to date on this Mac.
#
#   1. stores the admin password in the macOS Keychain (never in a file)
#   2. installs a launchd job that refreshes the workbook on a schedule
#
# Run:  tools/install-sync.sh
# Undo: tools/install-sync.sh --uninstall
#
set -euo pipefail

LABEL="app.notati.sales-sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/notati-sync.sh"
KEYCHAIN_SERVICE="notati-sync"
LOG="$HOME/Library/Logs/notati-sync.log"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed the scheduled sync. The workbook already on disk is untouched."
  echo "To also forget the password:  security delete-generic-password -s $KEYCHAIN_SERVICE"
  exit 0
fi

read -r -p "Admin email [admin@notati.com]: " EMAIL
EMAIL="${EMAIL:-admin@notati.com}"

echo
echo "Where should the workbook live?"
echo "  1) Desktop                     — this Mac only"
echo "  2) iCloud Drive                — also appears on your iPhone and iPad"
read -r -p "Choice [1]: " WHERE
if [ "${WHERE:-1}" = "2" ]; then
  DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Notati sales.xlsx"
else
  DEST="$HOME/Desktop/Notati sales.xlsx"
fi

echo
read -r -s -p "Admin password (stored in your Keychain, not on disk): " PASSWORD
echo
[ -n "$PASSWORD" ] || { echo "No password given — nothing was changed."; exit 1; }

security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a "$EMAIL" -w "$PASSWORD"
unset PASSWORD
echo "Password saved to the Keychain."

chmod +x "$SCRIPT"

echo
echo "Checking it works before scheduling anything…"
NOTATI_EMAIL="$EMAIL" NOTATI_DEST="$DEST" "$SCRIPT"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SCRIPT</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NOTATI_EMAIL</key><string>$EMAIL</string>
    <key>NOTATI_DEST</key><string>$DEST</string>
  </dict>
  <!-- Every 6 hours, and once whenever you log in. Missed runs (Mac asleep)
       fire as soon as it wakes, so the file is never stale for long. -->
  <key>StartInterval</key><integer>21600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "Done."
echo "  Workbook : $DEST"
echo "  Refreshes: every 6 hours, and at login"
echo "  Log      : $LOG"
echo "  Run now  : $SCRIPT"
echo "  Remove   : ${BASH_SOURCE[0]} --uninstall"
