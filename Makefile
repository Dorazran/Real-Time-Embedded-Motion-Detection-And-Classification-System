# Makefile — Embedded Motion Detection System
# Cross-compiles a fully-static ARM binary for QEMU vexpress-a15 (Cortex-A15).
#
# Usage:
#   make              # ARM cross-compile (default)
#   make host         # x86-64 host build for local testing
#   make check        # verify ARM binary after build
#   make frames       # generate 200 test PGM frames via Python
#   make clean        # remove build artefacts

CC      = arm-linux-gnueabihf-gcc
STRIP   = arm-linux-gnueabihf-strip

# Compiler flags:
#   -static           → self-contained binary; no shared libs needed on target
#   -march/-mtune     → cortex-a15 with NEON FPU (required for vexpress-a15 ABI)
#   -mfloat-abi=hard  → hardware FP ABI (must match QEMU vexpress ABI)
CFLAGS  = -std=c99 -O2 -Wall -Wextra -Wpedantic \
          -static \
          -march=armv7-a -mtune=cortex-a15 \
          -mfpu=neon-vfpv4 -mfloat-abi=hard \
          -D_POSIX_C_SOURCE=200809L \
          -Isrc

TARGET  = motion_detect
SRCDIR  = src

SRCS    = $(addprefix $(SRCDIR)/,   \
            main.c                  \
            image_reader.c          \
            roi_selector.c          \
            frame_comparator.c      \
            ai_classifier.c         \
            decision_engine.c       \
            uart_tx.c               \
            tcp_client.c            \
            logger.c                \
            fpga_sim.c)

OBJS    = $(SRCS:.c=.o)
DEPS    = $(SRCS:.c=.d)

.PHONY: all host check frames clean distclean

# ── ARM target (default) ──────────────────────────────────────────────────────
all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^
	$(STRIP) $@
	@echo ""
	@echo "  Built : $(TARGET)"
	@file $(TARGET)
	@ls -lh $(TARGET) | awk '{print "  Size  :", $$5}'

$(SRCDIR)/%.o: $(SRCDIR)/%.c
	$(CC) $(CFLAGS) -MMD -MP -c -o $@ $<

-include $(DEPS)

# ── Host x86-64 build (for local testing without QEMU) ───────────────────────
host:
	gcc -std=c99 -O2 -Wall -Wextra \
	    -D_POSIX_C_SOURCE=200809L \
	    -Isrc \
	    -o $(TARGET)_host \
	    $(SRCS)
	@echo "Built: $(TARGET)_host (x86-64)"

# ── Sanity check ─────────────────────────────────────────────────────────────
check: $(TARGET)
	@file $(TARGET) | grep -q "ARM" \
	    && echo "OK: $(TARGET) is an ARM binary" \
	    || (echo "FAIL: $(TARGET) is NOT an ARM binary"; exit 1)

# ── Generate test frames ──────────────────────────────────────────────────────
frames:
	python3 scripts/generate_frames.py test_frames/

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean:
	rm -f $(OBJS) $(DEPS) $(TARGET) $(TARGET)_host
	rm -f build/initramfs.cpio.gz

distclean: clean
	rm -rf build/rootfs
