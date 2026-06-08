#!/bin/bash
# build.sh - Full build script for the Embedded Motion Detection System
#
# Steps:
#   1. Verify toolchain
#   2. Cross-compile motion_detect
#   3. Grab base rootfs from the existing Lab 3 initramfs (no BusyBox build)
#   4. Inject motion_detect binary, motion.conf, test frames, and /init
#   5. Repack as initramfs.cpio.gz
#   6. Print QEMU launch command
#
# Prerequisites:
#   sudo apt-get install gcc-arm-linux-gnueabihf qemu-system-arm cpio rsync
#
# To receive TCP alerts on host before launching QEMU:
#   nc -lk 5000

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$PROJ_DIR/build"
ROOTFS="$BUILD_DIR/rootfs"
INITRAMFS="$BUILD_DIR/initramfs.cpio.gz"

# Lab 3 provides the working kernel, DTB, and base initramfs
LAB3_DIR="${LAB3_DIR:-$HOME/embedded_lab3}"
BASE_ROOTFS="$LAB3_DIR/initramfs"       # already-extracted rootfs directory
ZIMAGE="$LAB3_DIR/build-arm/arch/arm/boot/zImage"
DTB="$LAB3_DIR/build-arm/arch/arm/boot/dts/arm/vexpress-v2p-ca15-tc1.dtb"

CROSS="arm-linux-gnueabihf"
CC="${CROSS}-gcc"
MAKE_JOBS=$(nproc 2>/dev/null || echo 4)

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GRN}[build]${NC} $*"; }
warn()  { echo -e "${YLW}[warn] ${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Step 1: Verify toolchain ───────────────────────────────────────────────────
info "Checking toolchain..."
command -v "$CC"           || error "$CC not found. Install: sudo apt-get install gcc-arm-linux-gnueabihf"
command -v qemu-system-arm || error "qemu-system-arm not found. Install: sudo apt-get install qemu-system-arm"
command -v cpio            || error "cpio not found. Install: sudo apt-get install cpio"

[ -d "$BASE_ROOTFS" ] || \
    error "Lab 3 rootfs not found at $BASE_ROOTFS — set LAB3_DIR env var"
[ -f "$ZIMAGE" ]      || \
    error "Kernel not found at $ZIMAGE — set LAB3_DIR env var"

mkdir -p "$BUILD_DIR"

# ── Step 2: Cross-compile motion_detect ───────────────────────────────────────
info "Cross-compiling motion_detect..."
cd "$PROJ_DIR"
make -j"$MAKE_JOBS"
info "Binary: $PROJ_DIR/motion_detect ($(du -sh motion_detect | cut -f1))"

# ── Step 3: Seed rootfs from Lab 3 initramfs ──────────────────────────────────
info "Seeding rootfs from $BASE_ROOTFS ..."
rm -rf "$ROOTFS"
# rsync without /dev/* — device nodes require root; devtmpfs provides them at runtime
rsync -a --exclude='dev/*' "$BASE_ROOTFS/" "$ROOTFS/"
mkdir -p "$ROOTFS/dev" "$ROOTFS/tmp" "$ROOTFS/proc" "$ROOTFS/sys"
mkdir -p "$ROOTFS/etc" "$ROOTFS/root/frames"

# ── Step 4: Inject motion_detect artefacts ────────────────────────────────────
info "Injecting motion_detect binary, config, and test frames..."
cp "$PROJ_DIR/motion_detect"    "$ROOTFS/bin/motion_detect"
cp "$PROJ_DIR/motion.conf"      "$ROOTFS/etc/motion.conf"
cp "$PROJ_DIR"/test_frames/*.pgm "$ROOTFS/root/frames/" 2>/dev/null || \
    warn "No test PGM frames found in test_frames/"

# ── Step 5: Write /init ───────────────────────────────────────────────────────
info "Writing /init..."
cat > "$ROOTFS/init" <<'INIT'
#!/bin/sh
# /init - Motion Detection System on ARM Cortex-A15 (QEMU vexpress-a15)
# Extends Lab 3/5 BusyBox rootfs

mount -t proc  none /proc
mount -t sysfs none /sys
mount -t devtmpfs devtmpfs /dev 2>/dev/null || true
mkdir -p /dev/pts
mount -t devpts devpts /dev/pts 2>/dev/null || true
mount -t tmpfs tmpfs /tmp -o size=16m 2>/dev/null || true

echo ""
echo "================================================="
echo " ARM Cortex-A15 | QEMU vexpress-a15"
echo " Embedded Motion Detection System"
echo " (extends Lab 5 BusyBox rootfs)"
echo "================================================="

# Loopback + QEMU user-mode NAT (eth0=10.0.2.15, gw=10.0.2.2)
/bin/busybox ip link set lo up 2>/dev/null || true
/bin/busybox ip link set eth0 up 2>/dev/null && \
/bin/busybox ip addr add 10.0.2.15/24 dev eth0 2>/dev/null && \
/bin/busybox ip route add default via 10.0.2.2 2>/dev/null && \
echo "[init] Network: 10.0.2.15/24 gw 10.0.2.2" || \
echo "[init] Network not configured"

echo ""
echo "[init] Starting motion_detect..."
echo ""

/bin/motion_detect /etc/motion.conf

echo ""
echo "[init] motion_detect complete. Log: cat /tmp/motion_log.txt"
echo ""

exec /bin/sh
INIT
chmod +x "$ROOTFS/init"

# ── Step 6: Pack initramfs ────────────────────────────────────────────────────
info "Packing initramfs → $INITRAMFS"
cd "$ROOTFS"
find . | sort | cpio --quiet -o --format=newc | gzip -9 > "$INITRAMFS"
info "initramfs: $(du -sh "$INITRAMFS" | cut -f1)"

# ── Step 7: Print QEMU launch command ─────────────────────────────────────────
echo ""
echo -e "${GRN}========================================================${NC}"
echo -e "${GRN} Build complete!${NC}"
echo -e "${GRN}========================================================${NC}"
echo ""
echo "── Launch QEMU ────────────────────────────────────────"
cat <<CMD
qemu-system-arm \\
  -M vexpress-a15 \\
  -cpu cortex-a15 \\
  -m 512M \\
  -kernel ${ZIMAGE} \\
  -dtb    ${DTB} \\
  -initrd ${INITRAMFS} \\
  -append "root=/dev/ram0 rw console=ttyAMA0,115200" \\
  -net nic,model=lan9118 \\
  -net user,hostfwd=tcp::5000-:5000 \\
  -nographic \\
  -no-reboot
CMD
echo ""
echo "── TCP alert listener (run on HOST first) ──────────────"
echo "  nc -lk 5000"
echo ""
echo "── After boot, inspect the log ────────────────────────"
echo "  cat /tmp/motion_log.txt"
echo ""
