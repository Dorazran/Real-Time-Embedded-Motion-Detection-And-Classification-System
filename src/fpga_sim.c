/* fpga_sim.c - Software simulation of FPGA-accelerated pixel difference engine
 *
 * Models a 4-stage synchronous pipeline.  Each call to fpga_frame_diff()
 * simulates one full "frame clock" burst through the pipeline.
 *
 * =====================================================================
 * VHDL Entity (equivalent hardware description):
 * =====================================================================
 * library IEEE;
 * use IEEE.STD_LOGIC_1164.ALL;
 * use IEEE.NUMERIC_STD.ALL;
 *
 * entity pixel_diff_engine is
 *   generic (
 *     DATA_WIDTH     : natural := 8;   -- pixel depth
 *     ACCUM_WIDTH    : natural := 32   -- accumulator width
 *   );
 *   port (
 *     clk       : in  std_logic;
 *     rst       : in  std_logic;
 *     en        : in  std_logic;
 *     -- Stage 0 inputs
 *     pix_a     : in  unsigned(DATA_WIDTH-1  downto 0);
 *     pix_b     : in  unsigned(DATA_WIDTH-1  downto 0);
 *     threshold : in  unsigned(DATA_WIDTH-1  downto 0);
 *     -- Stage 3 outputs (valid 3 cycles after en asserted)
 *     accum_changed : out unsigned(ACCUM_WIDTH-1 downto 0);
 *     accum_sum     : out unsigned(ACCUM_WIDTH-1 downto 0);
 *     max_diff_out  : out unsigned(DATA_WIDTH-1  downto 0);
 *     valid_out     : out std_logic;
 *     done          : out std_logic
 *   );
 * end entity pixel_diff_engine;
 *
 * architecture rtl of pixel_diff_engine is
 *   -- ── Pipeline registers ──────────────────────────────────────────
 *   -- Stage 0 → 1 (FETCH latch)
 *   signal s0_pix_a, s0_pix_b : unsigned(7 downto 0);
 *   signal s0_valid            : std_logic;
 *   -- Stage 1 → 2 (DIFF latch)
 *   signal s1_diff             : unsigned(7 downto 0);
 *   signal s1_valid            : std_logic;
 *   -- Stage 2 → 3 (COMPARE latch)
 *   signal s2_diff             : unsigned(7 downto 0);
 *   signal s2_above_th         : std_logic;
 *   signal s2_valid            : std_logic;
 *   -- Stage 3 accumulator registers (ACCUM)
 *   signal s3_changed          : unsigned(31 downto 0);
 *   signal s3_sum              : unsigned(31 downto 0);
 *   signal s3_max              : unsigned(7  downto 0);
 * begin
 *   process(clk)
 *   begin
 *     if rising_edge(clk) then
 *       if rst = '1' then
 *         s0_valid <= '0'; s1_valid <= '0'; s2_valid <= '0';
 *         s3_changed <= (others => '0');
 *         s3_sum     <= (others => '0');
 *         s3_max     <= (others => '0');
 *       else
 *         -- Stage 0: FETCH ─ register inputs
 *         s0_pix_a <= pix_a;
 *         s0_pix_b <= pix_b;
 *         s0_valid <= en;
 *
 *         -- Stage 1: DIFF ─ absolute difference (single-cycle subtraction)
 *         if s0_pix_a >= s0_pix_b then
 *           s1_diff <= s0_pix_a - s0_pix_b;
 *         else
 *           s1_diff <= s0_pix_b - s0_pix_a;
 *         end if;
 *         s1_valid <= s0_valid;
 *
 *         -- Stage 2: COMPARE ─ threshold test
 *         s2_diff     <= s1_diff;
 *         s2_above_th <= '1' when s1_diff > threshold else '0';
 *         s2_valid    <= s1_valid;
 *
 *         -- Stage 3: ACCUM ─ running totals
 *         if s2_valid = '1' then
 *           if s2_above_th = '1' then
 *             s3_changed <= s3_changed + 1;
 *           end if;
 *           s3_sum <= s3_sum + s2_diff;
 *           if s2_diff > s3_max then
 *             s3_max <= s2_diff;
 *           end if;
 *         end if;
 *       end if;
 *     end if;
 *   end process;
 *
 *   accum_changed <= s3_changed;
 *   accum_sum     <= s3_sum;
 *   max_diff_out  <= s3_max;
 *   valid_out     <= s2_valid;
 * end architecture rtl;
 * =====================================================================
 */

#include "fpga_sim.h"
#include <stdint.h>

/* Simulated pipeline register set (one "thread" — no real parallelism) */
typedef struct {
    /* Stage 0: FETCH */
    uint8_t s0_pix_a, s0_pix_b;
    int     s0_valid;
    /* Stage 1: DIFF */
    uint8_t s1_diff;
    int     s1_valid;
    /* Stage 2: COMPARE */
    uint8_t s2_diff;
    int     s2_above_th;
    int     s2_valid;
    /* Stage 3: ACCUM (retained across "clock ticks") */
    uint32_t s3_changed;
    uint32_t s3_sum;
    uint32_t s3_sum_sq;  /* sum of squared diffs — drives std computation */
    uint8_t  s3_max;
} Pipeline;

static unsigned long g_last_cycles = 0;

/* Simulate one rising-edge clock tick with pixel inputs pix_a, pix_b */
static void clock_tick(Pipeline *p, uint8_t pix_a, uint8_t pix_b,
                        int en, int threshold)
{
    /* Evaluate stages in reverse order to avoid reading updated values */

    /* Stage 3: ACCUM */
    if (p->s2_valid) {
        if (p->s2_above_th)
            p->s3_changed++;
        p->s3_sum    += p->s2_diff;
        p->s3_sum_sq += (uint32_t)p->s2_diff * (uint32_t)p->s2_diff;
        if (p->s2_diff > p->s3_max)
            p->s3_max = p->s2_diff;
    }

    /* Stage 2: COMPARE */
    p->s2_diff     = p->s1_diff;
    p->s2_above_th = (p->s1_diff > (uint8_t)threshold) ? 1 : 0;
    p->s2_valid    = p->s1_valid;

    /* Stage 1: DIFF */
    p->s1_diff  = (p->s0_pix_a >= p->s0_pix_b)
                  ? (p->s0_pix_a - p->s0_pix_b)
                  : (p->s0_pix_b - p->s0_pix_a);
    p->s1_valid = p->s0_valid;

    /* Stage 0: FETCH */
    p->s0_pix_a = pix_a;
    p->s0_pix_b = pix_b;
    p->s0_valid = en;
}

int fpga_frame_diff(const PGMImage *a, const PGMImage *b,
                    FrameDiff *out, int threshold)
{
    if (!a || !b || !out) return -1;
    if (a->width != b->width || a->height != b->height) return -1;

    int total = a->width * a->height;

    /* Reset pipeline */
    Pipeline p;
    p.s0_pix_a = p.s0_pix_b = 0; p.s0_valid = 0;
    p.s1_diff  = 0;               p.s1_valid = 0;
    p.s2_diff  = 0; p.s2_above_th = 0; p.s2_valid = 0;
    p.s3_changed = 0; p.s3_sum = 0; p.s3_sum_sq = 0; p.s3_max = 0;

    unsigned long cycles = 0;

    /* Feed pixels through pipeline */
    for (int i = 0; i < total; i++) {
        clock_tick(&p, a->data[i], b->data[i], 1, threshold);
        cycles++;
    }

    /* Drain the pipeline: 3 extra ticks for stages 0→1→2→3 latency */
    for (int flush = 0; flush < 3; flush++) {
        clock_tick(&p, 0, 0, 0, threshold);
        cycles++;
    }

    g_last_cycles = cycles;

    out->changed_pixels = p.s3_changed;
    out->total_pixels   = (uint32_t)total;
    out->mean_diff      = total > 0 ? p.s3_sum / (uint32_t)total : 0;
    out->max_diff       = p.s3_max;

    /* std = sqrt(E[X²] - E[X]²) — reuse integer sqrt from software path */
    {
        uint32_t esq = total > 0 ? p.s3_sum_sq / (uint32_t)total : 0;
        uint32_t msq = out->mean_diff * out->mean_diff;
        /* isqrt32: Babylonian integer square root */
        uint32_t n = (esq >= msq) ? (esq - msq) : 0;
        uint32_t sx = n, sy;
        if (n > 0) { do { sy = sx; sx = (sx + n / sx) / 2; } while (sx < sy); }
        else { sy = 0; }
        out->std_diff = sy;
        uint32_t raw  = out->std_diff > 0
                      ? out->mean_diff * 10 / out->std_diff : 0;
        out->snr_x10  = raw > 999 ? 999 : raw;
    }

    return 0;
}

unsigned long fpga_last_cycles(void)
{
    return g_last_cycles;
}
