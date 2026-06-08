/* fpga_sim.h - Software simulation of FPGA pixel-diff acceleration
 *
 * Models a 4-stage pipelined pixel difference engine.
 * See fpga_sim.c for full VHDL entity documentation.
 *
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef FPGA_SIM_H
#define FPGA_SIM_H

#include "image_reader.h"
#include "frame_comparator.h"

/* Drop-in replacement for frame_compare() using the simulated FPGA pipeline.
 * Returns 0 on success, -1 on dimension mismatch. */
int fpga_frame_diff(const PGMImage *a, const PGMImage *b,
                    FrameDiff *out, int threshold);

/* Returns simulated clock cycles consumed by last fpga_frame_diff() call */
unsigned long fpga_last_cycles(void);

#endif /* FPGA_SIM_H */
