/* ai_classifier.c - Decision-tree classifier with adaptive thresholds */
#include "ai_classifier.h"
#include <stddef.h>

/*
 * Decision Tree (static boundaries during warm-up; adaptive after):
 *
 *  Root: pct < lo_thresh?  ──YES──> NONE
 *          │NO
 *          v
 *        pct < 10.0?
 *        ├─YES─> mean_diff < 30?  ──YES──> LOW
 *        │                │NO ──────────> MEDIUM
 *        └─NO─> pct < hi_thresh?  ──YES──> MEDIUM
 *                          │NO ───────────────> HIGH
 *
 * Warm-up (first 3 frames): lo_thresh=2.0%  hi_thresh=30.0% (fixed).
 * Adaptive:  lo = avg_pct * 0.5   hi = avg_pct * 1.5
 *            where avg_pct = rolling mean of last 10 frame-pair pct values.
 */

#define ADAPTIVE_WINDOW   10
#define ADAPTIVE_WARMUP    3
#define FIXED_LO_PCT      2.0f
#define FIXED_HI_PCT     30.0f

static float g_pct_buf[ADAPTIVE_WINDOW]; /* ring buffer of recent pct values */
static int   g_win_pos;                  /* next write position in ring       */
static int   g_fed;                      /* total frames fed (ever)           */

void classifier_feed(float pct)
{
    g_pct_buf[g_win_pos] = pct;
    g_win_pos = (g_win_pos + 1) % ADAPTIVE_WINDOW;
    g_fed++;
}

void classifier_get_thresholds(float *avg_out, float *lo_out,
                               float *hi_out, int *warmup_out)
{
    int remaining = ADAPTIVE_WARMUP - g_fed;
    if (remaining < 0) remaining = 0;

    if (g_fed < ADAPTIVE_WARMUP) {
        /* Still warming up — return fixed fallback thresholds */
        if (avg_out)    *avg_out    = (FIXED_LO_PCT + FIXED_HI_PCT) / 2.0f;
        if (lo_out)     *lo_out     = FIXED_LO_PCT;
        if (hi_out)     *hi_out     = FIXED_HI_PCT;
        if (warmup_out) *warmup_out = remaining;
        return;
    }

    /* Rolling average: walk backwards through the ring buffer */
    int n = g_fed < ADAPTIVE_WINDOW ? g_fed : ADAPTIVE_WINDOW;
    float sum = 0.0f;
    for (int i = 0; i < n; i++) {
        /* g_win_pos - 1 - i may be negative; add 2*WINDOW before mod */
        int idx = ((g_win_pos - 1 - i) + ADAPTIVE_WINDOW * 2) % ADAPTIVE_WINDOW;
        sum += g_pct_buf[idx];
    }
    float avg = sum / (float)n;

    float lo = avg * 0.5f;
    float hi = avg * 1.5f;
    if (lo < 1.0f)  lo = 1.0f;   /* floor: never below 1% */
    if (hi > 95.0f) hi = 95.0f;  /* ceiling: sanity cap   */

    if (avg_out)    *avg_out    = avg;
    if (lo_out)     *lo_out     = lo;
    if (hi_out)     *hi_out     = hi;
    if (warmup_out) *warmup_out = 0;
}

MotionLevel classify_motion(const FrameDiff *diff)
{
    if (!diff || diff->total_pixels == 0)
        return MOTION_NONE;

    float pct = (float)diff->changed_pixels /
                (float)diff->total_pixels * 100.0f;

    float lo, hi;
    classifier_get_thresholds(NULL, &lo, &hi, NULL);

    if (pct < lo)    return MOTION_NONE;
    if (pct < 10.0f) return (diff->mean_diff < 30) ? MOTION_LOW : MOTION_MEDIUM;
    if (pct < hi)    return MOTION_MEDIUM;
    return MOTION_HIGH;
}

const char *motion_level_str(MotionLevel level)
{
    switch (level) {
    case MOTION_NONE:   return "NONE";
    case MOTION_LOW:    return "LOW";
    case MOTION_MEDIUM: return "MEDIUM";
    case MOTION_HIGH:   return "HIGH";
    default:            return "UNKNOWN";
    }
}
