/* logger.c - Timestamped event logger */
#include "logger.h"

#include <fcntl.h>
#include <unistd.h>
#include <time.h>
#include <stdio.h>
#include <string.h>

int logger_init(const char *path)
{
    if (!path) return -1;
    return open(path, O_WRONLY | O_CREAT | O_APPEND, 0644);
}

void logger_log(int fd, MotionLevel level, const char *frame_name,
                const FrameDiff *diff)
{
    if (fd < 0 || !diff) return;

    time_t now = time(NULL);
    struct tm *t = gmtime(&now);

    char ts[32];
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", t);

    float pct = diff->total_pixels > 0
                ? (float)diff->changed_pixels / (float)diff->total_pixels * 100.0f
                : 0.0f;

    /* Manual fixed-point formatting avoids libm dependency */
    unsigned int pct_int  = (unsigned int)pct;
    unsigned int pct_frac = (unsigned int)((pct - (float)pct_int) * 10.0f);

    unsigned int snr_int  = diff->snr_x10 / 10;
    unsigned int snr_frac = diff->snr_x10 % 10;

    char line[320];
    int  len = snprintf(line, sizeof(line),
        "[%s] MOTION=%-6s  frame=%-20s"
        "  changed=%u/%u(%u.%u%%)"
        "  std=%u  snr=%u.%u\n",
        ts, motion_level_str(level),
        frame_name ? frame_name : "?",
        diff->changed_pixels, diff->total_pixels, pct_int, pct_frac,
        diff->std_diff, snr_int, snr_frac);

    if (len > 0) {
        ssize_t n = write(fd, line, (size_t)len);
        (void)n;
    }
}

void logger_close(int fd)
{
    if (fd >= 0) close(fd);
}
