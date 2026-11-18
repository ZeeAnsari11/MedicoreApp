#!/usr/bin/env bash
# One-time setup of an Android emulator on macOS without Android Studio: Java 17 + Google's command-line tools in
# ~/Library/Android, the emulator, one Android 15 (API 35) x86_64 image and a virtual phone sized for an 8 GB Mac.
# Safe to re-run: existing pieces are kept. Running it accepts the Android SDK licenses. Run:  npm run emulator:setup
# Intel Macs only as written (x86_64 image); on Apple silicon use the arm64-v8a image instead.
set -euo pipefail

ANDROID_DIR="$HOME/Library/Android"
export ANDROID_HOME="$ANDROID_DIR/sdk"
export JAVA_HOME="$ANDROID_DIR/jdk-17/Contents/Home"
AVD="${AVD:-Medicore_API_35}"
IMAGE="system-images;android-35;google_apis;x86_64"

mkdir -p "$ANDROID_DIR/downloads" "$ANDROID_HOME/cmdline-tools"
cd "$ANDROID_DIR/downloads"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "Downloading Java 17 (Eclipse Temurin)..."
  curl -fsSL -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/mac/x64/jdk/hotspot/normal/eclipse"
  mkdir -p "$ANDROID_DIR/jdk-17" && tar -xzf jdk17.tar.gz -C "$ANDROID_DIR/jdk-17" --strip-components=1
fi

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Downloading Android command-line tools..."
  zip="$(curl -fsS https://dl.google.com/android/repository/repository2-3.xml | grep -o 'commandlinetools-mac-[0-9]*_latest.zip' | sort -u | sort -t- -k3 -n | tail -1)"
  curl -fsSL -o cmdline-tools.zip "https://dl.google.com/android/repository/$zip"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest" "$ANDROID_HOME/cmdline-tools/cmdline-tools"
  unzip -q cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
echo "Installing platform-tools, emulator and $IMAGE (about 2 GB the first time)..."
"$SDKMANAGER" --install "platform-tools" "emulator" "$IMAGE" | tr '\r' '\n' | grep -vE '^\[=*|^\s*$' | tail -3 || true

if ! "$ANDROID_HOME/emulator/emulator" -list-avds | grep -qx "$AVD"; then
  echo "Creating virtual phone $AVD..."
  echo no | "$AVDMANAGER" create avd -n "$AVD" -k "$IMAGE" -d pixel_5 >/dev/null
  # Kept small for an 8 GB Mac that also runs MongoDB, the API and Metro. Software GPU: host GPU rendering crashes
  # the emulator on older Intel Macs ("Failed to find ColorBuffer").
  cfg="$HOME/.android/avd/$AVD.avd/config.ini"
  for kv in hw.ramSize=2048 vm.heapSize=256 disk.dataPartition.size=4G hw.keyboard=yes hw.gpu.enabled=yes hw.gpu.mode=swiftshader_indirect; do
    key="${kv%%=*}"
    grep -v "^$key[ =]" "$cfg" >"$cfg.tmp" || true
    echo "$kv" >>"$cfg.tmp" && mv "$cfg.tmp" "$cfg"
  done
fi

echo
echo "Done. Emulator: $AVD. Start the app in it with:  npm run emulator"
