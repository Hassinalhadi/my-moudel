#!/system/bin/sh
# post-fs-data.sh — earliest /data hook.
# Captures real serial before Zygisk spoofing starts.
# Writes default config if none exists.
# Applies boot integrity props via resetprop (system.prop is empty to avoid
# Magisk overlay fingerprinting — matches Kabir X approach).

MODDIR="${0%/*}"
. "$MODDIR/common/get_serial.sh"

# ── Capture real serial ────────────────────────────────────────────────────
SERIAL="$(get_original_serial)"
if [ -n "$SERIAL" ]; then
    TMP="$MODDIR/device.serial.tmp.$$"
    printf '%s\n' "$SERIAL" > "$TMP"
    chmod 0600 "$TMP"
    mv -f "$TMP" "$MODDIR/device.serial"
    chcon u:object_r:system_file:s0 "$MODDIR/device.serial" 2>/dev/null
fi

# ── Write default config if missing ───────────────────────────────────────
CFG="$MODDIR/config.json"
if [ ! -f "$CFG" ]; then
    cat > "$CFG" << 'JSONEOF'
{
  "global_spoof": {
    "enabled": false,
    "device_info": {}
  },
  "cpu_spoof": {
    "blacklist": [],
    "cpu_only_packages": []
  },
  "active_injections": {}
}
JSONEOF
    chmod 0644 "$CFG"
    chcon u:object_r:system_file:s0 "$CFG" 2>/dev/null
fi

# ── Boot integrity props (via resetprop, NOT system.prop overlay) ─────────
# These were previously in system.prop but that overlay is detectable by
# anti-tamper. resetprop is RAM-only and invisible. Matches Kabir X.
resetprop ro.boot.vbmeta.device_state locked 2>/dev/null
resetprop ro.boot.verifiedbootstate green 2>/dev/null
resetprop ro.boot.flash.locked 1 2>/dev/null
resetprop ro.boot.veritymode enforcing 2>/dev/null
resetprop ro.boot.warranty_bit 0 2>/dev/null
resetprop ro.warranty_bit 0 2>/dev/null
resetprop ro.build.type user 2>/dev/null
resetprop ro.build.tags release-keys 2>/dev/null
resetprop ro.debuggable 0 2>/dev/null
resetprop ro.secure 1 2>/dev/null
resetprop ro.force.debuggable 0 2>/dev/null
resetprop ro.adb.secure 1 2>/dev/null
resetprop ro.boot.selinux enforcing 2>/dev/null
resetprop ro.build.selinux 1 2>/dev/null

# ── Knox bypass — Samsung anti-detection ──────────────────────────────────
resetprop ro.security.knox.reduce_permissions 1 2>/dev/null
resetprop ro.config.knox.knox_custom_sw 1 2>/dev/null
resetprop ro.security.knox.reduce_permissions.compat 1 2>/dev/null
resetprop ro.bootloader "locked" 2>/dev/null

# ── Anti-root / Anti-emulator (matches X-2.4) ────────────────────────────
resetprop persist.sys.su 0 2>/dev/null
resetprop ro.su.access 0 2>/dev/null
resetprop ro.kernel.qemu 0 2>/dev/null
resetprop persist.sys.root_access 0 2>/dev/null

# NOTE: Device-specific props (model, fingerprint, etc.) are NOT applied here.
# Doing it this early can bootloop. They are applied post-boot by service.sh
# (via apply_props.sh) and per-app by the Zygisk .so. Matches Kabir X.

# ── Write initial status ───────────────────────────────────────────────────
STATUS="$MODDIR/status.json"
if [ ! -f "$STATUS" ]; then
    printf '%s\n' '{"status":"not_activated","expiresAt":0,"lastCheck":0,"message":"Send this serial to Admin for activation."}' > "$STATUS"
    chmod 0644 "$STATUS"
    chcon u:object_r:system_file:s0 "$STATUS" 2>/dev/null
fi
