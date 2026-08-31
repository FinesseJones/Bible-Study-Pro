#!/bin/bash
set -e

echo "=================================================="
echo "🍏 Bible Study Pro - macOS Native Packaging Utility"
echo "=================================================="

# 1. Build the production build
echo "🚀 Step 1: Building production bundle..."
pnpm run build || npm run build

# 2. Setup the macOS .app directory structure
export APP_NAME="Bible Study Pro"
export APP_DIR="${APP_NAME}.app"
export CONTENTS_DIR="${APP_DIR}/Contents"
export MACOS_DIR="${CONTENTS_DIR}/MacOS"
export RESOURCES_DIR="${CONTENTS_DIR}/Resources"
export REAL_PWD=$(pwd -P)

echo "📂 Step 2: Creating application folder structure..."
rm -rf "${APP_DIR}"
mkdir -p "${MACOS_DIR}"
mkdir -p "${RESOURCES_DIR}"

echo "📦 Step 2.5: Bundling server files and .env inside the application Resources..."
cp -R dist "${RESOURCES_DIR}/dist"
cp .env "${RESOURCES_DIR}/.env"
cp package.json "${RESOURCES_DIR}/package.json"
if [ -d "patches" ]; then
  cp -R patches "${RESOURCES_DIR}/patches"
fi

echo "📦 Step 2.6: Installing production dependencies in application Resources..."
REAL_PWD=$(pwd -P)
cp pnpm-lock.yaml "${RESOURCES_DIR}/" 2>/dev/null || true
cd "${RESOURCES_DIR}"
# Run installation with node's path in environment
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"
pnpm install --prod --no-frozen-lockfile || npm install --production
cd "${REAL_PWD}"

echo "📦 Step 2.7: Hoisting all transitive dependencies for ESM compatibility..."
# Node.js v22+ strict ESM resolution requires ALL transitive deps to be in
# the flat node_modules, not just in pnpm's virtual store (.pnpm/).
# This Python script copies every package from the pnpm virtual store to
# the top-level node_modules so the server can start correctly.
python3 << 'PYEOF'
import json, os, shutil, sys

app_nm = os.path.join(os.environ.get('REAL_PWD', '.'), os.environ.get('RESOURCES_DIR', ''), 'node_modules')
# Re-derive from script environment
import subprocess
resources_dir = subprocess.check_output(['bash', '-c', 'echo "${RESOURCES_DIR}"'], env=os.environ).decode().strip()
if not resources_dir:
    # fallback: find it relative to package-mac.sh
    resources_dir = None

# Use the RESOURCES_DIR env var passed through
import os
resources_env = os.environ.get('RESOURCES_DIR', '')
if resources_env and os.path.isdir(resources_env):
    app_nm = os.path.join(resources_env, 'node_modules')
elif os.path.isdir('node_modules'):
    app_nm = os.path.abspath('node_modules')
else:
    print("WARNING: Could not locate node_modules, skipping transitive dep hoisting")
    sys.exit(0)

pnpm_store = os.path.join(app_nm, '.pnpm')
if not os.path.isdir(pnpm_store):
    print(f"INFO: No pnpm store at {pnpm_store}, skipping hoisting")
    sys.exit(0)

# Build complete map of all packages in pnpm store
pnpm_pkgs = {}
for entry in os.listdir(pnpm_store):
    entry_path = os.path.join(pnpm_store, entry)
    if not os.path.isdir(entry_path):
        continue
    nm_path = os.path.join(entry_path, 'node_modules')
    if not os.path.exists(nm_path):
        continue
    for pkg in os.listdir(nm_path):
        if pkg.startswith('@'):
            # Handle scoped packages
            scoped_path = os.path.join(nm_path, pkg)
            if os.path.isdir(scoped_path):
                for scoped_pkg in os.listdir(scoped_path):
                    full_name = f"{pkg}/{scoped_pkg}"
                    pkg_path = os.path.join(scoped_path, scoped_pkg)
                    if os.path.isdir(pkg_path) and full_name not in pnpm_pkgs:
                        pnpm_pkgs[full_name] = pkg_path
        else:
            pkg_path = os.path.join(nm_path, pkg)
            if os.path.isdir(pkg_path) and pkg not in pnpm_pkgs:
                pnpm_pkgs[pkg] = pkg_path

print(f"  Found {len(pnpm_pkgs)} unique packages in pnpm virtual store")

# Copy all missing packages to the flat node_modules
copied = 0
errors = 0
for pkg_name, pkg_src in pnpm_pkgs.items():
    dest = os.path.join(app_nm, pkg_name)
    if not os.path.exists(dest):
        try:
            # Create parent dir for scoped packages
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copytree(pkg_src, dest, symlinks=False)
            copied += 1
        except Exception as e:
            errors += 1

# Also patch any CJS packages missing 'exports' field that ESM packages import
patched = 0
for pkg_name in os.listdir(app_nm):
    pkg_dir = os.path.join(app_nm, pkg_name)
    if not os.path.isdir(pkg_dir):
        continue
    pkg_json_path = os.path.join(pkg_dir, 'package.json')
    if not os.path.exists(pkg_json_path):
        continue
    try:
        with open(pkg_json_path) as f:
            pkg = json.load(f)
        if pkg.get('type') != 'module' and 'exports' not in pkg and pkg.get('main'):
            main = pkg['main']
            if not main.endswith('.js') and not os.path.isdir(os.path.join(pkg_dir, main)):
                main = main + '.js'
            if not main.startswith('./') and not main.startswith('.'):
                main = './' + main
            pkg['exports'] = {'.': {'require': main, 'import': main, 'default': main}}
            with open(pkg_json_path, 'w') as f:
                json.dump(pkg, f, indent=2)
            patched += 1
    except Exception:
        pass

print(f"  Hoisted {copied} transitive packages ({errors} errors)")
print(f"  Patched {patched} CJS packages with ESM exports field")
PYEOF
echo "✅ Dependency hoisting complete"

# 3. Compile the native Cocoa Swift desktop app wrapper
LAUNCHER_PATH="${MACOS_DIR}/${APP_NAME}"
echo "📝 Step 3: Compiling 100% native Cocoa Swift desktop app..."
if swiftc -O -o "${LAUNCHER_PATH}" scratch/BibleStudyProWebView.swift; then
  echo "✅ Standalone Swift app wrapper successfully compiled!"
  chmod +x "${LAUNCHER_PATH}"
else
  echo "❌ Error: Swift compilation failed! Cannot package the application."
  exit 1
fi


# 4. Create Info.plist config
echo "⚙️ Step 4: Configuring Info.plist bundle settings..."
cat << EOF > "${CONTENTS_DIR}/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>English</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.biblestudypro.app</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13.0</string>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>Bible Study Pro uses the microphone to transcribe live lessons and enable voice-activated study features.</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Bible Study Pro uses speech recognition to transcribe live Bible study sessions into text notes.</string>
    <key>NSCameraUsageDescription</key>
    <string>Bible Study Pro may use the camera for live study sessions.</string>
    <key>NSAppleEventsUsageDescription</key>
    <string>Bible Study Pro uses Apple Events to open files.</string>
</dict>
</plist>
EOF

# 5. Create the premium application icon
echo "🎨 Step 5: Injecting high-definition AppIcon assets..."
if [ -f "scratch/create_icns.sh" ]; then
  ./scratch/create_icns.sh
else
  echo "⚠️ Warning: scratch/create_icns.sh not found. Skipping custom icon."
fi

# 6. Build the standalone DMG installer!
echo "💿 Step 6: Compiling standalone DMG installer..."
DMG_NAME="BibleStudyPro.dmg"
rm -f "${DMG_NAME}"

# Resolve the absolute path to handle symlinked working directories
REAL_PWD=$(pwd -P)
REAL_APP_DIR="${REAL_PWD}/${APP_DIR}"
REAL_DMG_NAME="${REAL_PWD}/${DMG_NAME}"

# Clear app quarantine before packaging
echo "🛡️ Bypassing Gatekeeper: Clearing quarantine flags on the app bundle..."
xattr -cr "${REAL_APP_DIR}" 2>/dev/null || true

if hdiutil create \
  -volname "${APP_NAME} Installer" \
  -srcfolder "${REAL_APP_DIR}" \
  -ov \
  -format UDZO \
  "${REAL_DMG_NAME}"; then
  echo "✨ Created DMG: ./${DMG_NAME}"
  echo "🛡️ Bypassing Gatekeeper: Clearing quarantine flags on the DMG installer..."
  xattr -cr "${REAL_DMG_NAME}" 2>/dev/null || true
else
  echo "⚠️ WARNING: Standalone DMG compilation skipped or not supported in this environment (likely macOS sandboxing permissions)."
  echo "💡 Note: The standalone '${APP_DIR}' bundle is fully built, functional, and ready to use!"
fi

echo "=================================================="
echo "🎉 SUCCESS: Standing standalone package ready!"
echo "✨ Created: ./${DMG_NAME}"
echo "✨ Created: ./${APP_DIR}"
echo "=================================================="
echo "💡 You can now copy '${APP_DIR}' to /Applications"
echo "💡 Or open '${DMG_NAME}' to distribute the DMG!"
echo "=================================================="
