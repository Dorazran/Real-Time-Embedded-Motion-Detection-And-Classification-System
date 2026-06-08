/* image_reader.c - PGM loader supporting P2 (ASCII) and P5 (binary) */
#include "image_reader.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* Advance past whitespace and '#'-to-EOL comments */
static void skip_ws(FILE *f)
{
    int c;
    while ((c = fgetc(f)) != EOF) {
        if (c == '#') {
            while ((c = fgetc(f)) != EOF && c != '\n')
                ;
        } else if (!isspace((unsigned char)c)) {
            ungetc(c, f);
            return;
        }
    }
}

int pgm_read(const char *path, PGMImage *img)
{
    if (!path || !img) return -1;

    FILE *f = fopen(path, "rb");
    if (!f) return -2;

    /* Magic number: P2 or P5 */
    char magic[3] = {0, 0, 0};
    if (fread(magic, 1, 2, f) != 2) { fclose(f); return -3; }

    int binary;
    if (magic[0] == 'P' && magic[1] == '5')      binary = 1;
    else if (magic[0] == 'P' && magic[1] == '2') binary = 0;
    else { fclose(f); return -4; }

    skip_ws(f);
    if (fscanf(f, "%d", &img->width) != 1)  { fclose(f); return -5; }
    skip_ws(f);
    if (fscanf(f, "%d", &img->height) != 1) { fclose(f); return -6; }
    skip_ws(f);
    if (fscanf(f, "%d", &img->maxval) != 1) { fclose(f); return -7; }

    if (img->width  <= 0 || img->width  > MAX_IMG_WIDTH  ||
        img->height <= 0 || img->height > MAX_IMG_HEIGHT ||
        img->maxval <= 0 || img->maxval > 255) {
        fclose(f);
        return -8;
    }

    int total = img->width * img->height;
    img->data = (uint8_t *)malloc((size_t)total);
    if (!img->data) { fclose(f); return -9; }

    if (binary) {
        /* Exactly one whitespace byte separates maxval from pixel data */
        fgetc(f);
        if ((int)fread(img->data, 1, (size_t)total, f) != total) {
            free(img->data); img->data = NULL;
            fclose(f);
            return -10;
        }
    } else {
        for (int i = 0; i < total; i++) {
            int v;
            if (fscanf(f, "%d", &v) != 1) {
                free(img->data); img->data = NULL;
                fclose(f);
                return -11;
            }
            img->data[i] = (uint8_t)(v < 0 ? 0 : v > 255 ? 255 : v);
        }
    }

    fclose(f);
    return 0;
}

void pgm_free(PGMImage *img)
{
    if (img && img->data) {
        free(img->data);
        img->data = NULL;
        img->width = img->height = img->maxval = 0;
    }
}
