#!/system/bin/sh
# ==================================================================
# HMOD-Zero - Integrity Action (Play Integrity + Key Attestation)
#   Apply Pixel PIF props + inject valid keybox (TrickyStore) + restart GMS.
#   This is what makes a spoof pass hardware key attestation (Talabat etc.)
#   and look like a fresh, certified device — same approach as Kabir X.
#
#   REQUIRES the TrickyStore module installed (keybox is written to
#   /data/adb/tricky_store/keybox.xml). Without TrickyStore the keybox is
#   ignored and only the Pixel props apply.
#
#   SPOOF_PROPS=0 to skip global Pixel props (keybox only).
# ==================================================================
MODDIR="${0%/*}"
SPOOF_PROPS=1

KEYBOX_DIR="/data/adb/tricky_store"
PIF_JSON="$MODDIR/pif.json"
KEYBOX="$KEYBOX_DIR/keybox.xml"
BACKUP="/data/local/tmp/keybox_original.xml"
LOG="/data/local/tmp/hmods_integrity.log"
COUNTER_FILE="/data/local/tmp/hmods_profile_counter"
# Obfuscated keybox source (same as Kabir X). Replace with your own hosted
# keybox if this one gets revoked.
KEYBOX_URL="https://raw.githubusercontent.com/MeowDump/MeowDump/refs/heads/main/Megatron"

p()  { echo "$1"; echo "$1" >> "$LOG"; }
ok() { p "  [✔] $1"; }
er() { p "  [✘] $1"; }

header() {
  p "══════════════════════════════════════════════"
  p ""
  p "  ██╗  ██╗      ███╗   ███╗ ██████╗ ██████╗ ███████╗"
  p "  ██║  ██║      ████╗ ████║██╔═══██╗██╔══██╗██╔════╝"
  p "  ███████║█████╗██╔████╔██║██║   ██║██║  ██║███████╗"
  p "  ██╔══██║╚════╝██║╚██╔╝██║██║   ██║██║  ██║╚════██║"
  p "  ██║  ██║      ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████║"
  p "  ╚═╝  ╚═╝      ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝"
  p ""
  p "        I N T E G R I T Y   P L U S"
  p "══════════════════════════════════════════════"
}

: > "$LOG"
echo ""
header
p ""

mkdir -p "$KEYBOX_DIR"

# ---- Find resetprop ----
RESETPROP=""
for x in /data/adb/magisk/resetprop /data/adb/ksu/bin/resetprop \
         /data/adb/ap/bin/resetprop /system/bin/resetprop; do
  [ -f "$x" ] && RESETPROP="$x" && break
done
[ -z "$RESETPROP" ] && command -v resetprop >/dev/null 2>&1 && RESETPROP="resetprop"

if [ -z "$RESETPROP" ]; then
  er "resetprop not found"
else
  ok "resetprop found"
fi

# ---- Apply Pixel PIF props (cycle through profiles) ----
if [ "$SPOOF_PROPS" = "1" ] && [ -n "$RESETPROP" ] && [ -f "$PIF_JSON" ]; then
  PROFILES="pixel9 pixel9proxl pixel9pro pixel8pro pixel8 pixel7pro"
  PROFILE_COUNT=6
  [ -f "$COUNTER_FILE" ] && COUNTER=$(cat "$COUNTER_FILE" 2>/dev/null) || COUNTER=0
  case "$COUNTER" in ''|*[!0-9]*) COUNTER=0 ;; esac
  N=0
  ACTIVE="pixel9"
  for prof in $PROFILES; do
    [ "$N" -eq "$COUNTER" ] && ACTIVE="$prof" && break
    N=$((N + 1))
  done
  echo "$(((COUNTER + 1) % PROFILE_COUNT))" > "$COUNTER_FILE" 2>/dev/null

  field() {
    awk -v pr="\"$1\":" -v fl="\"$2\"" '
      BEGIN{f=0} $0~pr{f=1;next}
      f&&$0~fl{gsub(/.*"[^"]*"[[:space:]]*:[[:space:]]*"/,"");gsub(/".*/,"");print;exit}
      f&&/}/{f=0}' "$PIF_JSON"
  }
  FP=$(field "$ACTIVE" "FINGERPRINT")
  MODEL=$(field "$ACTIVE" "MODEL")
  BID=$(field "$ACTIVE" "ID")

  ok "Profile: $ACTIVE (Cycle)"
  p ""
  p "  Device: $MODEL"
  p "  Build:  $BID"
  p ""

  if [ -n "$FP" ]; then
    p "  [✦] Applying Pixel integrity properties..."
    "$RESETPROP" ro.build.fingerprint "$FP" 2>/dev/null
    "$RESETPROP" ro.product.manufacturer "$(field "$ACTIVE" MANUFACTURER)" 2>/dev/null
    "$RESETPROP" ro.product.model "$MODEL" 2>/dev/null
    "$RESETPROP" ro.product.brand "$(field "$ACTIVE" BRAND)" 2>/dev/null
    "$RESETPROP" ro.product.name "$(field "$ACTIVE" PRODUCT)" 2>/dev/null
    "$RESETPROP" ro.product.device "$(field "$ACTIVE" DEVICE)" 2>/dev/null
    "$RESETPROP" ro.build.id "$BID" 2>/dev/null
    "$RESETPROP" ro.build.version.incremental "$(field "$ACTIVE" INCREMENTAL)" 2>/dev/null
    "$RESETPROP" ro.build.version.security_patch "$(field "$ACTIVE" SECURITY_PATCH)" 2>/dev/null
    "$RESETPROP" ro.build.type "user" 2>/dev/null
    "$RESETPROP" ro.build.tags "release-keys" 2>/dev/null
    ok "Properties applied"
  fi
fi

# ---- Download + inject keybox (TrickyStore) ----
p ""
p "  [✦] Downloading keybox..."
[ -s "$KEYBOX" ] && cp -f "$KEYBOX" "$BACKUP" 2>/dev/null
E=$(mktemp -p /data/local/tmp)
if command -v wget >/dev/null 2>&1; then
  wget -q --no-check-certificate -O "$E" "$KEYBOX_URL" 2>/dev/null
elif command -v curl >/dev/null 2>&1; then
  curl -fsSL --insecure "$KEYBOX_URL" -o "$E" 2>/dev/null
fi

PASS="❌"
if [ -s "$E" ]; then
  i=0
  while [ $i -lt 10 ]; do
    T=$(mktemp -p /data/local/tmp)
    base64 -d "$E" > "$T" 2>/dev/null && rm -f "$E" && E="$T"
    i=$((i + 1))
  done
  H=$(mktemp -p /data/local/tmp)
  xxd -r -p "$E" > "$H" 2>/dev/null && rm -f "$E"
  tr 'A-Za-z' 'N-ZA-Mn-za-m' < "$H" > "$KEYBOX" 2>/dev/null && rm -f "$H"
  if [ -s "$KEYBOX" ]; then
    chmod 644 "$KEYBOX"
    chcon u:object_r:system_file:s0 "$KEYBOX" 2>/dev/null
    ok "Keybox injected -> $KEYBOX"
    PASS="✅"
  else
    er "Keybox decode failed"
    [ -s "$BACKUP" ] && cp -f "$BACKUP" "$KEYBOX" 2>/dev/null
  fi
else
  er "Keybox download failed (check internet / URL)"
  rm -f "$E"
fi

# ---- Restart GMS so Play Integrity re-reads props + keybox ----
p ""
ok "Restarting GMS..."
pkill -f "com.google.android.gms" 2>/dev/null
sleep 1

# ---- Final ----
p ""
header
p ""
ok "Integrity spoof complete!"
p ""
p "  Keybox: $PASS"
p ""
p "  Note: TrickyStore module must be installed for the keybox to apply."
p "  [✓ Action Complete]"
p ""

exit 0
