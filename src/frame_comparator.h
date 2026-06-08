/* frame_comparator.h - Pixel-by-pixel frame difference
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef FRAME_COMPARATOR_H
#define FRAME_COMPARATOR_H

#include "image_reader.h"
#include <stdint.h>

typedef struct {
    uint32_t changed_pixels;  /* pixels with |diff| > threshold */
    uint32_t total_pixels;
    uint32_t mean_diff;       /* sum_of_all_diffs / total_pixels */
    uint32_t max_diff;        /* largest single-pixel absolute diff */
    uint32_t std_diff;        /* std deviation of all |diffs|, integer */
    uint32_t snr_x10;         /* 10 × (mean_diff / std_diff); 0 if std=0 */
} FrameDiff;

/* Compares two same-size ROI images. threshold: min diff to count a pixel.
 * Returns 0 on success, -1 if dimensions mismatch. */
int frame_compare(const PGMImage *a, const PGMImage *b,
                  FrameDiff *diff, int threshold);

/* Prints a UTF-8 block-character heatmap of per-pixel diffs to stdout. */
void frame_heatmap(const PGMImage *a, const PGMImage *b, int threshold);

#endif /* FRAME_COMPARATOR_H */
