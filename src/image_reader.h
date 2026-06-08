/* image_reader.h - PGM image loader (P2 ASCII, P5 binary)
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef IMAGE_READER_H
#define IMAGE_READER_H

#include <stdint.h>

#define MAX_IMG_WIDTH  640
#define MAX_IMG_HEIGHT 480

typedef struct {
    uint8_t *data;   /* malloc'd pixel buffer, row-major */
    int      width;
    int      height;
    int      maxval;
} PGMImage;

/* Returns 0 on success, negative error code on failure */
int  pgm_read(const char *path, PGMImage *img);
void pgm_free(PGMImage *img);

#endif /* IMAGE_READER_H */
