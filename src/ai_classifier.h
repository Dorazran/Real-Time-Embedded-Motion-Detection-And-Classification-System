/* ai_classifier.h - Decision-tree motion classifier
 *
 * Decision Tree (2-feature, 4-class):
 *
 *           [changed_pct >= 2.0%]
 *          /                     \
 *        NO                      YES
 *       NONE          [changed_pct >= 10.0%]
 *                    /                     \
 *                  NO                      YES
 *          [mean_diff >= 30]      [changed_pct >= 30.0%]
 *          /             \        /                    \
 *        NO             YES     NO                    YES
 *       LOW           MEDIUM  MEDIUM                 HIGH
 *
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef AI_CLASSIFIER_H
#define AI_CLASSIFIER_H

#include "frame_comparator.h"

typedef enum {
    MOTION_NONE   = 0,
    MOTION_LOW    = 1,
    MOTION_MEDIUM = 2,
    MOTION_HIGH   = 3
} MotionLevel;

MotionLevel classify_motion(const FrameDiff *diff);
const char *motion_level_str(MotionLevel level);

/* Feed the latest frame's changed_pct into the rolling window.
 * Call once per frame pair, AFTER calling classify_motion(). */
void classifier_feed(float pct);

/* Return current adaptive thresholds.
 * avg_out, lo_out, hi_out: any may be NULL.
 * warmup_out: frames remaining in warm-up period, 0 when adaptive mode active. */
void classifier_get_thresholds(float *avg_out, float *lo_out,
                               float *hi_out, int *warmup_out);

#endif /* AI_CLASSIFIER_H */
