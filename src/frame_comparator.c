/* frame_comparator.c - Pixel-by-pixel absolute difference + heatmap */
#include "frame_comparator.h"
#include <stdio.h>

/* Integer square root (Babylonian convergence) */
static uint32_t isqrt32(uint32_t n)
{
    if (n == 0) return 0;
    uint32_t x = n, y;
    do { y = x; x = (x + n / x) / 2; } while (x < y);
    return y;
}

int frame_compare(const PGMImage *a, const PGMImage *b,
                  FrameDiff *diff, int threshold)
{
    if (!a || !b || !diff) return -1;
    if (a->width != b->width || a->height != b->height) return -1;

    int total = a->width * a->height;
    uint32_t changed  = 0;
    uint32_t sum_diff = 0;
    uint32_t sum_sq   = 0;
    uint32_t max_diff = 0;

    for (int i = 0; i < total; i++) {
        int d = (int)a->data[i] - (int)b->data[i];
        if (d < 0) d = -d;

        uint32_t ud = (uint32_t)d;
        if (ud > (uint32_t)threshold) changed++;
        sum_diff += ud;
        sum_sq   += ud * ud;
        if (ud > max_diff) max_diff = ud;
    }

    diff->changed_pixels = changed;
    diff->total_pixels   = (uint32_t)total;
    diff->mean_diff      = total > 0 ? sum_diff / (uint32_t)total : 0;
    diff->max_diff       = max_diff;

    /* std = sqrt(E[X²] - E[X]²)  — variance from two accumulators */
    uint32_t esq      = total > 0 ? sum_sq / (uint32_t)total : 0;
    uint32_t msq      = diff->mean_diff * diff->mean_diff;
    diff->std_diff    = isqrt32(esq >= msq ? esq - msq : 0);
    uint32_t raw_snr  = diff->std_diff > 0
                      ? diff->mean_diff * 10 / diff->std_diff : 0;
    diff->snr_x10     = raw_snr > 999 ? 999 : raw_snr;

    return 0;
}

/*
 * UTF-8 block characters (each is 3 bytes):
 *   ░ U+2591  light shade  — no significant change
 *   ▒ U+2592  medium shade — minor change  (threshold < diff ≤ 50)
 *   ▓ U+2593  dark shade   — moderate      (50 < diff ≤ 100)
 *   █ U+2588  full block   — large change  (diff > 100)
 */
void frame_heatmap(const PGMImage *a, const PGMImage *b, int threshold)
{
    if (!a || !b || a->width != b->width || a->height != b->height) return;

    int W = a->width, H = a->height, c;

    printf("[heatmap] %dx%d ROI  "
           "(\xe2\x96\x91=none \xe2\x96\x92=low \xe2\x96\x93=med "
           "\xe2\x96\x88=high  thr=%d)\n", W, H, threshold);

    /* ┌──...──┐ */
    printf("  \xe2\x94\x8c");
    for (c = 0; c < W; c++) printf("\xe2\x94\x80");
    printf("\xe2\x94\x90\n");

    for (int r = 0; r < H; r++) {
        printf("  \xe2\x94\x82");   /* │ */
        for (c = 0; c < W; c++) {
            int d = (int)a->data[r * W + c] - (int)b->data[r * W + c];
            if (d < 0) d = -d;

            if      (d <= threshold) printf("\xe2\x96\x91"); /* ░ */
            else if (d <= 50)        printf("\xe2\x96\x92"); /* ▒ */
            else if (d <= 100)       printf("\xe2\x96\x93"); /* ▓ */
            else                     printf("\xe2\x96\x88"); /* █ */
        }
        printf("\xe2\x94\x82\n");   /* │ */
    }

    /* └──...──┘ */
    printf("  \xe2\x94\x94");
    for (c = 0; c < W; c++) printf("\xe2\x94\x80");
    printf("\xe2\x94\x98\n");
}
