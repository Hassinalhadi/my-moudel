#!/system/bin/sh
# service.sh — late_start entry point.
# Wait for boot to complete, then BECOME the license daemon via exec.
# NOTE: do NOT background with "&" — on KernelSU/SukiSU/APatch a backgrounded
# child of service.sh gets reaped, so the daemon ran once then died (status.json
# froze, license refresh + revocation stopped). exec keeps this process alive as
# the daemon, exactly like the Kabir reference module.
MODDIR="${0%/*}"

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 2
done
sleep 5

chmod 0644 "$MODDIR/config.json" 2>/dev/null
chcon u:object_r:system_file:s0 "$MODDIR/config.json" 2>/dev/null

chmod 0755 "$MODDIR/bin/licverify" 2>/dev/null

# Knox bypass + bootloader lock (same as Kabir service.sh)
resetprop ro.security.knox.reduce_permissions 1 2>/dev/null
resetprop ro.config.knox.knox_custom_sw 1 2>/dev/null
resetprop ro.security.knox.reduce_permissions.compat 1 2>/dev/null
resetprop ro.bootloader "locked" 2>/dev/null

# Anti-root / Anti-emulator (matches X-2.4)
resetprop persist.sys.su 0 2>/dev/null
resetprop ro.su.access 0 2>/dev/null
resetprop ro.kernel.qemu 0 2>/dev/null
resetprop persist.sys.root_access 0 2>/dev/null

# Re-apply the device injected from the WebUI (safety pass after boot)
[ -f "$MODDIR/apply_props.sh" ] && sh "$MODDIR/apply_props.sh" >/dev/null 2>&1

exec sh "$MODDIR/service_v2.sh" --daemon >> "$MODDIR/service.log" 2>&1
