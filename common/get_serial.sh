#!/system/bin/sh
get_original_serial() {
    SERIAL="$(getprop ro.serialno 2>/dev/null)"
    [ -z "$SERIAL" ] && SERIAL="$(getprop ro.boot.serialno 2>/dev/null)"

    if [ -z "$SERIAL" ] && [ -r /proc/bootconfig ]; then
        SERIAL="$(sed -n 's/^[[:space:]]*androidboot\.serialno[[:space:]]*=[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' /proc/bootconfig | head -n 1)"
    fi

    if [ -z "$SERIAL" ] && [ -r /proc/cmdline ]; then
        SERIAL="$(tr ' ' '\n' < /proc/cmdline | sed -n 's/^androidboot\.serialno=//p' | head -n 1)"
    fi

    SERIAL="$(printf '%s' "$SERIAL" | tr -d '\r\n"[:space:]')"

    case "$SERIAL" in
        ""|unknown|UNKNOWN|null|NULL) return 1 ;;
    esac

    printf '%s\n' "$SERIAL"
}
