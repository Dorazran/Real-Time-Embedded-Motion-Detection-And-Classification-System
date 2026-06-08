/* logger.h - Timestamped event logger to /tmp/motion_log.txt
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef LOGGER_H
#define LOGGER_H

#include "ai_classifier.h"

/* Opens log file (append). Returns fd or -1. */
int  logger_init(const char *path);

/* Appends one ISO-8601 timestamped line per event (includes std and snr). */
void logger_log(int fd, MotionLevel level, const char *frame_name,
                const FrameDiff *diff);

void logger_close(int fd);

#endif /* LOGGER_H */
