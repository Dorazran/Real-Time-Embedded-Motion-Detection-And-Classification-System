#!/usr/bin/env python3
"""
generate_frames.py — Reproducible PGM test frame generator
============================================================
Generates 200 grayscale PGM frames (frame_000.pgm – frame_199.pgm)
that produce a realistic motion-detection workload when processed
sequentially by the motion_detect binary.

Frame format: PGM P2 (ASCII), 16×16 pixels, maxval=255.
Pixel values: 50 (dark background) or 200 (bright — motion marker).

Motion model
------------
Each consecutive frame pair produces a diff with a target number of
"changed" pixels (|diff| > PIXEL_THRESHOLD=20).  Pixel flips are
applied cumulatively to a stateful "current scene" buffer so that
the diff is well-defined for every consecutive pair.

Classification targets (199 pairs total):
  NONE   : ~28%  →  0–4  pixels changed  (below 2% of 256)
  LOW    : ~14%  → 5–25  pixels changed  (2–10%)
  MEDIUM : ~33%  → 26–76 pixels changed  (10–30%)
  HIGH   : ~25%  → 77–200 pixels changed (>30%)

Usage
-----
  python3 scripts/generate_frames.py [output_dir]

  Default output_dir: test_frames/
"""
import os
import sys
import random

SEED      = 42          # fixed seed → reproducible results
WIDTH     = 16
HEIGHT    = 16
N_PIXELS  = WIDTH * HEIGHT   # 256
DARK      = 50
BRIGHT    = 200
N_FRAMES  = 200         # produces N_FRAMES-1 = 199 frame pairs


def pgm_write(path: str, pixels: list[int]) -> None:
    """Write a 16×16 P2 PGM file."""
    with open(path, "w") as f:
        f.write(f"P2\n{WIDTH} {HEIGHT}\n255\n")
        for row in range(HEIGHT):
            line = " ".join(str(pixels[row * WIDTH + col])
                            for col in range(WIDTH))
            f.write(line + "\n")


def make_frames(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(SEED)

    # Motion-level distribution for 199 pairs (indices 1–199)
    # NONE≈28%, LOW≈14%, MEDIUM≈33%, HIGH≈25%
    levels: list[str] = []
    dist = {
        "NONE":   0.28,
        "LOW":    0.14,
        "MEDIUM": 0.33,
        "HIGH":   0.25,
    }
    # Build a shuffled list with the right counts
    counts = {
        "NONE":   56,
        "LOW":    27,
        "MEDIUM": 65,
        "HIGH":   51,
    }
    for lvl, cnt in counts.items():
        levels.extend([lvl] * cnt)
    rng.shuffle(levels)
    assert len(levels) == 199, f"Expected 199 levels, got {len(levels)}"

    # Pixel ranges for each level (number of pixels to flip per pair)
    flip_ranges = {
        "NONE":   (0,  4),
        "LOW":    (5,  25),
        "MEDIUM": (26, 76),
        "HIGH":   (77, 200),
    }

    # Initialise scene buffer: all dark
    scene = [DARK] * N_PIXELS

    # Frame 0: base (all dark)
    pgm_write(os.path.join(out_dir, "frame_000.pgm"), scene)
    print(f"  frame_000.pgm  (base frame — all dark)")

    total = 0
    level_counts = {k: 0 for k in counts}

    for i, lvl in enumerate(levels, start=1):
        lo, hi = flip_ranges[lvl]
        n_flip = rng.randint(lo, hi)

        # Pick n_flip unique pixel indices and toggle their value
        indices = rng.sample(range(N_PIXELS), n_flip)
        new_scene = scene[:]
        for idx in indices:
            new_scene[idx] = BRIGHT if new_scene[idx] == DARK else DARK

        fname = f"frame_{i:03d}.pgm"
        pgm_write(os.path.join(out_dir, fname), new_scene)
        scene = new_scene
        level_counts[lvl] += 1
        total += 1

    print(f"\n  Generated {N_FRAMES} frames ({total} pairs) in '{out_dir}'")
    print("  Target motion distribution:")
    for lvl, cnt in level_counts.items():
        pct = cnt / total * 100
        print(f"    {lvl:<8s} {cnt:3d} pairs  ({pct:.1f}%)")
    print()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "test_frames"
    print(f"Generating {N_FRAMES} PGM frames → {out}/")
    make_frames(out)
    print("Done.")
