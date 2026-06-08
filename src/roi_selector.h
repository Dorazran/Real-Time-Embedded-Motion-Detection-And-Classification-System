/* roi_selector.h - Region of Interest crop
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef ROI_SELECTOR_H
#define ROI_SELECTOR_H

#include "image_reader.h"

typedef struct {
    int x;       /* left edge, pixels from image left */
    int y;       /* top edge,  pixels from image top  */
    int width;
    int height;
} ROI;

/* Crops src into a newly-allocated dst.
 * ROI is clamped to image bounds.
 * Caller must pgm_free(dst) when done.
 * Returns 0 on success. */
int roi_crop(const PGMImage *src, PGMImage *dst, const ROI *roi);

#endif /* ROI_SELECTOR_H */
