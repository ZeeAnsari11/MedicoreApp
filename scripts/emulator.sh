#!/usr/bin/env bash
# Boots the local Android emulator (if it isn't running yet) and opens the app in Expo Go inside it.
# The emulator reaches the API on this Mac at http://10.0.2.2:4000/api (.env.development). Run:  npm run emulator
# One-time setup first:  npm run emulator:setup. See docs/RUN-ON-EMULATOR.md.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
AVD="${AVD:-Medicore_API_35}"

command -v emulator >/dev/null || { echo "Android emulator not installed. Run:  npm run emulator:setup" >&2; exit 1; }
emulator -list-avds | grep -qx "$AVD" || { echo "Virtual phone $AVD not found. Run:  npm run emulator:setup" >&2; exit 1; }

if grep -qs '^EXPO_PUBLIC_API_URL=' .env.development.local .env.local; then
  echo "WARNING: EXPO_PUBLIC_API_URL in .env.development.local/.env.local overrides the emulator URL in .env.development."
fi
curl -fsS -m 3 http://localhost:4000/api/health >/dev/null 2>&1 || echo "WARNING: the API is not running. Start it in the Medicore repo with:  pnpm local"

if ! adb devices | grep -q '^emulator-.*device$'; then
  log="$(mktemp -t medicore-emulator)"
  echo "Starting emulator $AVD (first boot can take a few minutes on this Mac; log: $log)..."
  # Software rendering: the host GPU path crashes the emulator on older Intel Macs. Override with EMULATOR_GPU=host.
  nohup emulator -avd "$AVD" -gpu "${EMULATOR_GPU:-swiftshader_indirect}" -no-boot-anim -no-audio -no-snapshot-save >"$log" 2>&1 &
  adb wait-for-device
  for _ in $(seq 1 300); do
    [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
    sleep 1
  done
  [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] || { echo "Emulator did not finish booting (see $log)" >&2; exit 1; }
fi
# A slow Mac reports "booted" before the package manager accepts installs; Expo Go's install then fails.
for _ in $(seq 1 60); do
  adb shell pm path android 2>/dev/null | grep -q '^package:' && break
  sleep 2
done
echo "Emulator ready. Expo installs Expo Go on it the first time and opens the app. Demo login: demo.admin / Demo@12345"
# --localhost: Expo Go loads the bundle through an adb port forward instead of the Mac's Wi-Fi IP, which the
# emulator can't reliably reach ("Software caused connection abort").
exec npx expo start --android --localhost "$@"
