/* decision_engine.h - Pipeline orchestrator
 * Ties image_reader → roi_selector → fpga_sim/frame_comparator →
 *     ai_classifier → uart_tx + tcp_client + logger
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef DECISION_ENGINE_H
#define DECISION_ENGINE_H

#include "roi_selector.h"

typedef struct {
    char frames_dir[256];   /* directory containing *.pgm files */
    ROI  roi;               /* region of interest to crop */
    int  pixel_threshold;   /* min |diff| to count a pixel as changed */
    int  use_fpga_sim;      /* 1 = FPGA-sim diff, 0 = software diff */
    int  uart_fd;           /* open UART fd, or -1 to skip */
    char tcp_host[64];      /* alert destination (dotted IPv4) */
    int  tcp_port;          /* alert destination port */
    int  log_fd;            /* open log fd, or -1 to skip */
} EngineCtx;

/* Reads all *.pgm from ctx->frames_dir, sorted, processes consecutive pairs.
 * Returns number of pairs processed, or negative on fatal error. */
int engine_run(EngineCtx *ctx);

#endif /* DECISION_ENGINE_H */
