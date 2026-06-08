/* roi_selector.c - Region of Interest crop */
#include "roi_selector.h"

#include <stdlib.h>
#include <string.h>

int roi_crop(const PGMImage *src, PGMImage *dst, const ROI *roi)
{
    if (!src || !src->data || !dst || !roi) return -1;

    /* Clamp to source bounds */
    int x = roi->x < 0 ? 0 : roi->x;
    int y = roi->y < 0 ? 0 : roi->y;
    int w = roi->width;
    int h = roi->height;

    if (x >= src->width || y >= src->height) return -2;
    if (x + w > src->width)  w = src->width  - x;
    if (y + h > src->height) h = src->height - y;
    if (w <= 0 || h <= 0) return -3;

    dst->data = (uint8_t *)malloc((size_t)(w * h));
    if (!dst->data) return -4;

    dst->width  = w;
    dst->height = h;
    dst->maxval = src->maxval;

    for (int row = 0; row < h; row++) {
        memcpy(dst->data + row * w,
               src->data + (y + row) * src->width + x,
               (size_t)w);
    }

    return 0;
}
