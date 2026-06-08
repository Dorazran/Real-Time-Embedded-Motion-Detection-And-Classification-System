/* decision_engine.c - Pipeline orchestrator */
#include "decision_engine.h"
#include "image_reader.h"
#include "roi_selector.h"
#include "frame_comparator.h"
#include "fpga_sim.h"
#include "ai_classifier.h"
#include "uart_tx.h"
#include "tcp_client.h"
#include "logger.h"

#include <dirent.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define MAX_FRAMES 1024

/* ── Frame list collection ────────────────────────────────────────── */

static int cmp_str_ptr(const void *a, const void *b)
{
    return strcmp(*(const char **)a, *(const char **)b);
}

static int collect_pgm_frames(const char *dir, char **list, int max)
{
    DIR *d = opendir(dir);
    if (!d) return -1;

    int count = 0;
    struct dirent *e;
    while ((e = readdir(d)) != NULL && count < max) {
        size_t nlen = strlen(e->d_name);
        if (nlen <= 4) continue;
        if (strcmp(e->d_name + nlen - 4, ".pgm") != 0) continue;

        size_t full_len = strlen(dir) + 1 + nlen + 1;
        char *path = (char *)malloc(full_len);
        if (!path) continue;
        snprintf(path, full_len, "%s/%s", dir, e->d_name);
        list[count++] = path;
    }
    closedir(d);

    qsort(list, (size_t)count, sizeof(char *), cmp_str_ptr);
    return count;
}

/* ── Alert helpers ────────────────────────────────────────────────── */

static void send_alert(const EngineCtx *ctx,
                       MotionLevel level,
                       const char  *frame_a,
                       const char  *frame_b,
                       const FrameDiff *diff)
{
    char msg[512];
    float pct = diff->total_pixels > 0
                ? (float)diff->changed_pixels /
                  (float)diff->total_pixels * 100.0f
                : 0.0f;
    unsigned int pi = (unsigned int)pct;
    unsigned int pf = (unsigned int)((pct - (float)pi) * 10.0f);

    /* Base name only for display */
    const char *na = strrchr(frame_a, '/');
    const char *nb = strrchr(frame_b, '/');
    na = na ? na + 1 : frame_a;
    nb = nb ? nb + 1 : frame_b;

    snprintf(msg, sizeof(msg),
        "MOTION_ALERT level=%s frames=[%s->%s] "
        "changed=%u/%u(%u.%u%%) mean=%u max=%u\r\n",
        motion_level_str(level), na, nb,
        diff->changed_pixels, diff->total_pixels,
        pi, pf,
        diff->mean_diff, diff->max_diff);

    /* UART */
    if (ctx->uart_fd >= 0)
        uart_send(ctx->uart_fd, msg);

    /* TCP: connect per alert — reconnects gracefully if server restarts */
    if (ctx->tcp_port > 0 && ctx->tcp_host[0] != '\0') {
        int tfd = tcp_connect(ctx->tcp_host, ctx->tcp_port);
        if (tfd >= 0) {
            tcp_send(tfd, msg);
            tcp_close(tfd);
        }
    }
}

/* ── Main engine loop ─────────────────────────────────────────────── */

int engine_run(EngineCtx *ctx)
{
    if (!ctx) return -1;

    char *frame_paths[MAX_FRAMES];
    int count = collect_pgm_frames(ctx->frames_dir, frame_paths, MAX_FRAMES);
    if (count < 0) {
        fprintf(stderr, "[engine] cannot open frames dir: %s\n",
                ctx->frames_dir);
        return -1;
    }
    if (count < 2) {
        fprintf(stderr, "[engine] need at least 2 frames, found %d\n", count);
        for (int i = 0; i < count; i++) free(frame_paths[i]);
        return 0;
    }

    printf("[engine] %d frames found in %s\n", count, ctx->frames_dir);

    PGMImage cur_raw  = {NULL,0,0,0};
    PGMImage prev_raw = {NULL,0,0,0};
    PGMImage cur_roi  = {NULL,0,0,0};
    PGMImage prev_roi = {NULL,0,0,0};

    /* Preload first frame */
    if (pgm_read(frame_paths[0], &prev_raw) != 0) {
        fprintf(stderr, "[engine] cannot read %s\n", frame_paths[0]);
        for (int i = 0; i < count; i++) free(frame_paths[i]);
        return -1;
    }
    if (roi_crop(&prev_raw, &prev_roi, &ctx->roi) != 0) {
        fprintf(stderr, "[engine] ROI crop failed for %s\n", frame_paths[0]);
        pgm_free(&prev_raw);
        for (int i = 0; i < count; i++) free(frame_paths[i]);
        return -1;
    }

    int pairs = 0;

    for (int i = 1; i < count; i++) {
        if (pgm_read(frame_paths[i], &cur_raw) != 0) {
            fprintf(stderr, "[engine] skip unreadable: %s\n", frame_paths[i]);
            continue;
        }
        if (roi_crop(&cur_raw, &cur_roi, &ctx->roi) != 0) {
            fprintf(stderr, "[engine] ROI crop failed: %s\n", frame_paths[i]);
            pgm_free(&cur_raw);
            continue;
        }

        FrameDiff diff;
        int rc;
        if (ctx->use_fpga_sim) {
            rc = fpga_frame_diff(&prev_roi, &cur_roi, &diff,
                                 ctx->pixel_threshold);
            if (rc == 0)
                printf("[fpga]   cycles=%lu\n", fpga_last_cycles());
        } else {
            rc = frame_compare(&prev_roi, &cur_roi, &diff,
                               ctx->pixel_threshold);
        }

        if (rc != 0) {
            fprintf(stderr, "[engine] compare error (dim mismatch?)\n");
        } else {
            /* ── 1. Terminal heatmap ─────────────────────────────────── */
            frame_heatmap(&prev_roi, &cur_roi, ctx->pixel_threshold);

            /* ── 2. Adaptive threshold status ───────────────────────── */
            float avg_pct, lo_pct, hi_pct;
            int   warmup_left;
            classifier_get_thresholds(&avg_pct, &lo_pct, &hi_pct, &warmup_left);

            /* Manual float→string to avoid %f / libm */
            unsigned int li = (unsigned int)lo_pct;
            unsigned int lf = (unsigned int)((lo_pct  - (float)li) * 10.0f);
            unsigned int hi_i = (unsigned int)hi_pct;
            unsigned int hi_f = (unsigned int)((hi_pct - (float)hi_i) * 10.0f);

            if (warmup_left > 0) {
                printf("[adapt]  WARM-UP (%d frame(s) left)"
                       "  fixed: lo=%u.%u%%  hi=%u.%u%%\n",
                       warmup_left, li, lf, hi_i, hi_f);
            } else {
                unsigned int ai = (unsigned int)avg_pct;
                unsigned int af = (unsigned int)((avg_pct - (float)ai) * 10.0f);
                printf("[adapt]  ADAPTIVE  avg=%u.%u%%"
                       "  lo=%u.%u%%  hi=%u.%u%%\n",
                       ai, af, li, lf, hi_i, hi_f);
            }

            /* ── 3. Classify (uses current adaptive thresholds) ──────── */
            MotionLevel level = classify_motion(&diff);

            /* ── 4. Feed pct after classification (for next frame) ───── */
            float cur_pct = diff.total_pixels > 0
                          ? (float)diff.changed_pixels /
                            (float)diff.total_pixels * 100.0f
                          : 0.0f;
            classifier_feed(cur_pct);

            const char *na = strrchr(frame_paths[i-1], '/');
            const char *nb = strrchr(frame_paths[i],   '/');
            na = na ? na + 1 : frame_paths[i-1];
            nb = nb ? nb + 1 : frame_paths[i];

            /* ── 5. Print result with std and snr ────────────────────── */
            printf("[engine] %s -> %s : MOTION=%-6s"
                   "  changed=%u/%u  mean=%u  std=%u  snr=%u.%u  max=%u\n",
                   na, nb, motion_level_str(level),
                   diff.changed_pixels, diff.total_pixels,
                   diff.mean_diff, diff.std_diff,
                   diff.snr_x10 / 10, diff.snr_x10 % 10,
                   diff.max_diff);

            if (level != MOTION_NONE)
                send_alert(ctx, level, frame_paths[i-1], frame_paths[i], &diff);

            logger_log(ctx->log_fd, level, nb, &diff);
            pairs++;
        }

        /* Slide window: prev ← cur */
        pgm_free(&prev_roi);
        pgm_free(&prev_raw);
        prev_roi = cur_roi;
        prev_raw = cur_raw;
        cur_roi.data = NULL;
        cur_raw.data = NULL;
    }

    pgm_free(&prev_roi);
    pgm_free(&prev_raw);

    for (int i = 0; i < count; i++) free(frame_paths[i]);

    printf("[engine] done — %d pair(s) processed\n", pairs);
    return pairs;
}
