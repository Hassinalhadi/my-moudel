#!/system/bin/sh
# Re-apply the injected device props after every boot.
# The WebUI Inject button writes the chosen device to spoof_props.prop (key=value
# per line) and applies it with resetprop. resetprop is runtime-only, so without
# this script the props vanish on reboot while config.json (and the UI) still
# say "active". Called from service.sh after boot_completed.
MODDIR=${0%/*}
F="$MODDIR/spoof_props.prop"

# Backward compat: if old boot_props.sh exists but new format doesn't, run the old
if [ ! -s "$F" ] && [ -s "$MODDIR/boot_props.sh" ]; then
    sh "$MODDIR/boot_props.sh" >/dev/null 2>&1
    exit $?
fi

[ -s "$F" ] || exit 0
command -v resetprop >/dev/null 2>&1 || exit 0
while IFS= read -r line || [ -n "$line" ]; do
    line=$(printf '%s' "$line" | tr -d '\r')
    k=${line%%=*}
    v=${line#*=}
    case "$k" in ''|'#'*|*[!A-Za-z0-9._-]*) continue ;; esac
    [ -n "$v" ] && resetprop -n "$k" "$v" 2>/dev/null
done < "$F"
exit 0
