#!/system/bin/sh

show_header() {
  ui_print "══════════════════════════════════════════════"
  ui_print "          HMOD-Zero — DEVICE SPOOF            "
  ui_print "══════════════════════════════════════════════"
}

show_footer() {
  ui_print "══════════════════════════════════════════════"
}

log_status() { ui_print "  [✦] $1"; }
log_ok()     { ui_print "  [✔] $1"; }
log_fail()   { ui_print "  [✘] $1"; show_footer; exit 1; }

show_header
log_status "Installing HMOD-Zero..."

# ── Boot mode check ───────────────────────────────────────────────────────
if ! $BOOTMODE; then
  log_fail "Recovery installation detected. Flash through Magisk, KernelSU or APatch Manager."
fi

if [ "$API" -lt 28 ]; then
  log_fail "Unsupported Android version. Android 9.0 or newer is required."
fi

# ── Root solution detection (single only — matches Kabir) ─────────────────
ACTIVE_SOLUTIONS=0
ROOT_ENV=""

if command -v apd >/dev/null 2>&1; then
  ROOT_ENV="APatch"
  ACTIVE_SOLUTIONS=$((ACTIVE_SOLUTIONS + 1))
fi

if command -v ksud >/dev/null 2>&1; then
  ROOT_ENV="KernelSU"
  ACTIVE_SOLUTIONS=$((ACTIVE_SOLUTIONS + 1))
fi

if command -v magisk >/dev/null 2>&1; then
  ROOT_ENV="Magisk"
  ACTIVE_SOLUTIONS=$((ACTIVE_SOLUTIONS + 1))
fi

if [ "$ACTIVE_SOLUTIONS" -eq 0 ]; then
  log_fail "Supported root framework was not detected."
fi

if [ "$ACTIVE_SOLUTIONS" -gt 1 ]; then
  log_fail "Multiple root framework environments were detected."
fi

log_ok "$ROOT_ENV environment detected."

# ── Zygisk layer check ────────────────────────────────────────────────────
check_zygisk_layer() {
  if [ -d "/data/adb/modules/rezygisk" ] && [ ! -f "/data/adb/modules/rezygisk/disable" ]; then
    return 0
  fi
  if [ -d "/data/adb/modules/zygisksu" ] && [ ! -f "/data/adb/modules/zygisksu/disable" ]; then
    return 0
  fi
  if [ -d "/data/adb/modules/zygisk_next" ] && [ ! -f "/data/adb/modules/zygisk_next/disable" ]; then
    return 0
  fi
  return 1
}

if ! check_zygisk_layer; then
  log_fail "Active Zygisk Next, ReZygisk or ZygiskSU framework was not detected."
fi

log_ok "Zygisk framework detected."

# ── Architecture validation ───────────────────────────────────────────────
show_header
log_status "Targeting architecture variables..."

PRIMARY_ABI="$(getprop ro.product.cpu.abi 2>/dev/null)"
SYSTEM_ABI_LIST="$(getprop ro.product.cpu.abilist 2>/dev/null)"
ARCH_VERIFIED=false
SELECTED_ARCH=""

case "$PRIMARY_ABI" in
  arm64-v8a|arm64|aarch64)
    ARCH_VERIFIED=true
    SELECTED_ARCH="arm64"
    log_ok "ARM64 architecture identified."
    ;;
  armeabi-v7a|armeabi|armv7l)
    ARCH_VERIFIED=true
    SELECTED_ARCH="arm32"
    log_ok "ARM32 architecture identified."
    ;;
esac

if ! $ARCH_VERIFIED; then
  if echo "$SYSTEM_ABI_LIST" | grep -qE '(^|,)arm64-v8a(,|$)'; then
    ARCH_VERIFIED=true
    SELECTED_ARCH="arm64"
    log_ok "ARM64 architecture identified from ABI list."
  elif echo "$SYSTEM_ABI_LIST" | grep -qE '(^|,)(armeabi-v7a|armeabi)(,|$)'; then
    ARCH_VERIFIED=true
    SELECTED_ARCH="arm32"
    log_ok "ARM32 architecture identified from ABI list."
  fi
fi

if ! $ARCH_VERIFIED; then
  log_fail "Incompatible architecture. ARM64 or ARM32 device is required."
fi

log_status "Primary ABI: ${PRIMARY_ABI:-unknown}"
log_status "ABI List: ${SYSTEM_ABI_LIST:-unknown}"

# ── Select the license verifier CLI for this device's ABI ─────────────────
case "$SELECTED_ARCH" in
    arm64) LIC_SRC="$MODPATH/bin/arm64-v8a/licverify" ;;
    arm32) LIC_SRC="$MODPATH/bin/armeabi-v7a/licverify" ;;
esac

# ── Integrity + authenticity (STRICT): only a genuine, signed build flashes ──
if [ ! -f "$MODPATH/checksums.sha256" ] || [ ! -f "$MODPATH/checksums.sig" ]; then
    ui_print " "
    log_fail "MISSING SIGNED MANIFEST — this is not a genuine build."
fi
if [ ! -f "$LIC_SRC" ]; then
    log_fail "Missing verifier for $SELECTED_ARCH — refusing to flash."
fi
if command -v sha256sum >/dev/null 2>&1; then
    if ! ( cd "$MODPATH" && sha256sum -c checksums.sha256 >/dev/null 2>&1 ); then
        ui_print " "
        log_fail "INTEGRITY CHECK FAILED — files were modified."
    fi
    log_ok "File integrity verified"
else
    ui_print "! sha256sum unavailable — relying on signature only"
fi
chmod 0755 "$LIC_SRC" 2>/dev/null
if ! "$LIC_SRC" --verify-manifest "$MODPATH/checksums.sha256" "$MODPATH/checksums.sig" >/dev/null 2>&1; then
    ui_print " "
    ui_print "  A modified or self-signed manifest was detected."
    log_fail "SIGNATURE INVALID — this build is not genuine."
fi
log_ok "Signature verified (genuine build)"

if [ -f "$LIC_SRC" ]; then
    cp -f "$LIC_SRC" "$MODPATH/bin/licverify"
    log_ok "License verifier installed ($SELECTED_ARCH)"
else
    ui_print "! Missing license verifier for $SELECTED_ARCH — build first"
fi
rm -rf "$MODPATH/bin/arm64-v8a" "$MODPATH/bin/armeabi-v7a"

# ── Permissions ───────────────────────────────────────────────────────────
log_status "Configuring runtime execution permissions..."

for target_script in \
  customize.sh \
  service.sh \
  service_v2.sh \
  action.sh \
  post-fs-data.sh \
  apply_props.sh \
  common/get_serial.sh
do
  [ -f "$MODPATH/$target_script" ] && chmod 0755 "$MODPATH/$target_script" 2>/dev/null
done

for target_config in \
  module.prop \
  config.json \
  online.conf \
  status.json \
  checksums.sha256 \
  checksums.sig
do
  [ -f "$MODPATH/$target_config" ] && chmod 0644 "$MODPATH/$target_config" 2>/dev/null
done

for zygisk_library in \
  zygisk/arm64-v8a.so \
  zygisk/armeabi-v7a.so
do
  if [ -f "$MODPATH/$zygisk_library" ]; then
    chmod 0644 "$MODPATH/$zygisk_library" 2>/dev/null
  else
    log_fail "Required Zygisk library is missing: $zygisk_library"
  fi
done

[ -f "$MODPATH/bin/licverify" ] && chmod 0755 "$MODPATH/bin/licverify" 2>/dev/null

# ── SELinux context ───────────────────────────────────────────────────────
log_status "Applying mandatory SELinux security contexts..."

find "$MODPATH" -type f 2>/dev/null | while IFS= read -r f; do
    chcon u:object_r:system_file:s0 "$f" 2>/dev/null
done

# ── Cleanup stale files ──────────────────────────────────────────────────
log_status "Running cleanup routines..."

rm -f \
  "$MODPATH/license.grant" \
  "$MODPATH/license.grant.tmp"* \
  "$MODPATH/license.key" \
  "$MODPATH/.lic_hb" 2>/dev/null

rm -rf \
  "$MODPATH/system/etc/sysconfig" \
  "$MODPATH/system/product/etc/sysconfig" 2>/dev/null

find "$MODPATH" -mindepth 1 -type d -empty -delete 2>/dev/null

# ── Done ──────────────────────────────────────────────────────────────────
ui_print " "
log_ok "Installation completed successfully!"
log_status "Platform configured for $SELECTED_ARCH deployment."
log_status "Reboot the device to activate HMOD-Zero."
log_status "Open KSU/APatch WebUI to manage targets."
show_footer
