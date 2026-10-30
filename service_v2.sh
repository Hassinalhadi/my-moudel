#!/system/bin/sh
# service_v2.sh — HMOD-Zero background service.
# Handles:
#   - License refresh + revocation
#   - Bluetooth app-ops blocking for active injection targets
#   - Periodic status.json update
#   - Serial refresh

MODDIR="/data/adb/modules/hmod_zero"
CONFIG_FILE="$MODDIR/config.json"
STATUS_FILE="$MODDIR/status.json"
SERIAL_FILE="$MODDIR/device.serial"
LIC_BIN="$MODDIR/bin/licverify"
BT_APPLIED_FILE="$MODDIR/.bt_applied"
CONF="$MODDIR/online.conf"

# Verify before running — matches Kabir's startup gate.
[ -x "$LIC_BIN" ] || exit 21
"$LIC_BIN" >/dev/null 2>&1 || exit 27

# Read CHECK_INTERVAL from online.conf (default 1800, min 300 — matches Kabir)
CHECK_INTERVAL="$(sed -n 's/^CHECK_INTERVAL=\([0-9][0-9]*\)$/\1/p' "$CONF" 2>/dev/null | head -n 1)"
CHECK_INTERVAL="${CHECK_INTERVAL:-1800}"
case "$CHECK_INTERVAL" in ''|*[!0-9]*) CHECK_INTERVAL=1800 ;; esac
[ "$CHECK_INTERVAL" -ge 300 ] 2>/dev/null || CHECK_INTERVAL=300

. "$MODDIR/common/get_serial.sh"

# ── Helpers ────────────────────────────────────────────────────────────────
json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g'; }

write_status() {
    STATUS="$1"
    EXPIRES_AT="${2:-0}"
    MSG="${3:-HMOD-Zero running.}"
    NOW="$(date +%s 2>/dev/null)"; [ -z "$NOW" ] && NOW=0
    case "$EXPIRES_AT" in ''|*[!0-9]*) EXPIRES_AT=0 ;; esac
    TMP="$STATUS_FILE.tmp.$$"
    printf '{"status":"%s","expiresAt":%s,"lastCheck":%s,"message":"%s"}\n' \
        "$(json_escape "$STATUS")" \
        "$EXPIRES_AT" \
        "$NOW" \
        "$(json_escape "$MSG")" > "$TMP" || { rm -f "$TMP"; return 1; }
    chmod 0644 "$TMP"
    mv -f "$TMP" "$STATUS_FILE" || { rm -f "$TMP"; return 1; }
    chcon u:object_r:system_file:s0 "$STATUS_FILE" 2>/dev/null
}

is_safe_pkg() {
    PKG="$1"
    [ -n "$PKG" ] || return 1
    [ "${#PKG}" -le 200 ] || return 1
    case "$PKG" in *.*) ;; *) return 1 ;; esac
    case "$PKG" in *[!a-zA-Z0-9._]*) return 1 ;; esac
    return 0
}

# ── Read target packages from config.json active_injections ───────────────
read_target_packages() {
    [ -r "$CONFIG_FILE" ] || return 0
    awk '
        function count_char(text, needle, count, i) {
            count = 0
            for (i = 1; i <= length(text); i++) {
                if (substr(text, i, 1) == needle) count++
            }
            return count
        }
        /"active_injections"[[:space:]]*:/ {
            in_active = 1; depth = 0
            pos = index($0, "{")
            if (pos > 0) {
                rest = substr($0, pos)
                depth += count_char(rest, "{")
                depth -= count_char(rest, "}")
            }
            next
        }
        in_active {
            if (depth == 1 && $0 ~ /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\{/) {
                pkg = $0
                sub(/^[[:space:]]*"/, "", pkg)
                sub(/"[[:space:]]*:.*/, "", pkg)
                if (pkg ~ /^[A-Za-z0-9_]+([.][A-Za-z0-9_]+)+$/) print pkg
            }
            depth += count_char($0, "{")
            depth -= count_char($0, "}")
            if (depth <= 0) exit
        }
    ' "$CONFIG_FILE" 2>/dev/null
}

# ── Bluetooth blocking ─────────────────────────────────────────────────────
block_bt()  { is_safe_pkg "$1" || return 1
    cmd appops set "$1" BLUETOOTH_SCAN ignore >/dev/null 2>&1
    cmd appops set "$1" BLUETOOTH_ADVERTISE ignore >/dev/null 2>&1; }
reset_bt()  { is_safe_pkg "$1" || return 1
    cmd appops set "$1" BLUETOOTH_SCAN default >/dev/null 2>&1
    cmd appops set "$1" BLUETOOTH_ADVERTISE default >/dev/null 2>&1; }

apply_bt_blocks() {
    CUR="$MODDIR/.bt_current.$$"
    NEW="$MODDIR/.bt_new.$$"
    read_target_packages | sort -u > "$CUR"
    chmod 0600 "$CUR"

    if [ -r "$BT_APPLIED_FILE" ]; then
        while IFS= read -r OLD || [ -n "$OLD" ]; do
            is_safe_pkg "$OLD" || continue
            grep -Fxq "$OLD" "$CUR" 2>/dev/null || reset_bt "$OLD"
        done < "$BT_APPLIED_FILE"
    fi

    : > "$NEW"
    while IFS= read -r PKG || [ -n "$PKG" ]; do
        is_safe_pkg "$PKG" || continue
        block_bt "$PKG"
        printf '%s\n' "$PKG" >> "$NEW"
    done < "$CUR"

    sort -u "$NEW" 2>/dev/null > "$BT_APPLIED_FILE.tmp" || :
    mv -f "$BT_APPLIED_FILE.tmp" "$BT_APPLIED_FILE" 2>/dev/null
    chmod 0600 "$BT_APPLIED_FILE" 2>/dev/null
    chcon u:object_r:system_file:s0 "$BT_APPLIED_FILE" 2>/dev/null
    rm -f "$CUR" "$NEW"
}

# ── Serial refresh ─────────────────────────────────────────────────────────
refresh_serial() {
    S="$(get_original_serial)" || return 1
    TMP="$SERIAL_FILE.tmp.$$"
    printf '%s\n' "$S" > "$TMP"
    chmod 0600 "$TMP"
    mv -f "$TMP" "$SERIAL_FILE"
    chcon u:object_r:system_file:s0 "$SERIAL_FILE" 2>/dev/null
}

# ── License state ────────────────────────────────────────────────────────
refresh_license() {
    [ -x "$LIC_BIN" ] || return 0
    "$LIC_BIN" --refresh >/dev/null 2>&1
    chcon u:object_r:system_file:s0 "$MODDIR/license.grant" "$MODDIR/license.key" \
        "$MODDIR/.lic_hb" 2>/dev/null || true
}

is_licensed() {
    [ -x "$LIC_BIN" ] || return 1
    "$LIC_BIN" >/dev/null 2>&1
}

revoke_targets() {
    read_target_packages | sort -u | while IFS= read -r PKG || [ -n "$PKG" ]; do
        is_safe_pkg "$PKG" || continue
        am force-stop "$PKG" >/dev/null 2>&1
        reset_bt "$PKG"
    done
}

# ── Main tick ──────────────────────────────────────────────────────────────
check_once() {
    refresh_serial
    refresh_license
    if is_licensed; then
        apply_bt_blocks
        PKGS="$(read_target_packages | tr '\n' ',' | sed 's/,$//')"
        [ -z "$PKGS" ] && PKGS="none"
        write_status "active" "0" "Licensed. Targets: $PKGS"
    else
        revoke_targets
        write_status "not_activated" "0" "Unlicensed — injection disabled. Activate in WebUI."
    fi
}

case "$1" in
    --once) check_once; exit $? ;;
    --daemon|"")
        while true; do
            check_once
            sleep "$CHECK_INTERVAL"
        done ;;
    *) exit 2 ;;
esac
