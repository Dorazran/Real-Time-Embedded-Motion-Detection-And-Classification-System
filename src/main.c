/* main.c - Embedded Motion Detection System
 *
 * Usage: motion_detect [config_file]
 *        Default config: /etc/motion.conf
 *
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 * Extends: Lab 5 BusyBox advanced apps
 */
#include "decision_engine.h"
#include "uart_tx.h"
#include "logger.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>

/* ── Config parser ────────────────────────────────────────────────── */

typedef struct {
    char frames_dir[256];
    int  roi_x, roi_y, roi_w, roi_h;
    int  pixel_threshold;
    char uart_device[64];
    char tcp_host[64];
    int  tcp_port;
    char log_file[256];
    int  use_fpga_sim;
} MotionConf;

static void conf_defaults(MotionConf *c)
{
    strncpy(c->frames_dir,   "/root/frames",    255);
    strncpy(c->uart_device,  "/dev/ttyAMA0",    63);
    strncpy(c->tcp_host,     "10.0.2.2",        63);
    strncpy(c->log_file,     "/tmp/motion_log.txt", 255);
    c->roi_x = 0;  c->roi_y = 0;
    c->roi_w = 16; c->roi_h = 16;
    c->pixel_threshold = 20;
    c->tcp_port        = 5000;
    c->use_fpga_sim    = 1;
}

/* Strips leading and trailing whitespace in-place */
static void trim(char *s)
{
    int i = 0;
    while (s[i] == ' ' || s[i] == '\t') i++;
    if (i) memmove(s, s + i, strlen(s + i) + 1);
    int len = (int)strlen(s);
    while (len > 0 && (s[len-1] == ' ' || s[len-1] == '\t' ||
                       s[len-1] == '\r' || s[len-1] == '\n'))
        s[--len] = '\0';
}

static int parse_conf(const char *path, MotionConf *c)
{
    FILE *f = fopen(path, "r");
    if (!f) return -1;

    char line[512];
    while (fgets(line, sizeof(line), f)) {
        /* Strip newline; skip blanks and comments */
        trim(line);
        if (line[0] == '\0' || line[0] == '#') continue;

        char key[128] = {0}, val[256] = {0};
        if (sscanf(line, "%127[^=]=%255[^\n]", key, val) != 2) continue;
        trim(key); trim(val);

        if      (!strcmp(key, "FRAMES_DIR"))      snprintf(c->frames_dir,  sizeof(c->frames_dir),  "%s", val);
        else if (!strcmp(key, "ROI_X"))           c->roi_x           = atoi(val);
        else if (!strcmp(key, "ROI_Y"))           c->roi_y           = atoi(val);
        else if (!strcmp(key, "ROI_WIDTH"))       c->roi_w           = atoi(val);
        else if (!strcmp(key, "ROI_HEIGHT"))      c->roi_h           = atoi(val);
        else if (!strcmp(key, "PIXEL_THRESHOLD")) c->pixel_threshold = atoi(val);
        else if (!strcmp(key, "UART_DEVICE"))     snprintf(c->uart_device, sizeof(c->uart_device), "%s", val);
        else if (!strcmp(key, "TCP_HOST"))        snprintf(c->tcp_host,    sizeof(c->tcp_host),    "%s", val);
        else if (!strcmp(key, "TCP_PORT"))        c->tcp_port        = atoi(val);
        else if (!strcmp(key, "LOG_FILE"))        snprintf(c->log_file,    sizeof(c->log_file),    "%s", val);
        else if (!strcmp(key, "USE_FPGA_SIM"))    c->use_fpga_sim    = atoi(val);
    }

    fclose(f);
    return 0;
}

/* ── Signal handling ──────────────────────────────────────────────── */

static volatile int g_running = 1;

static void on_signal(int sig)
{
    (void)sig;
    g_running = 0;
}

/* ── Entry point ──────────────────────────────────────────────────── */

int main(int argc, char *argv[])
{
    const char *conf_path = (argc > 1) ? argv[1] : "/etc/motion.conf";

    signal(SIGINT,  on_signal);
    signal(SIGTERM, on_signal);

    printf("=================================================\n");
    printf(" Embedded Motion Detection System\n");
    printf(" ARM Cortex-A15 | QEMU vexpress-a15\n");
    printf(" Config: %s\n", conf_path);
    printf("=================================================\n");

    MotionConf cfg;
    conf_defaults(&cfg);

    if (parse_conf(conf_path, &cfg) != 0) {
        fprintf(stderr, "[main] warning: cannot open %s, using defaults\n",
                conf_path);
    }

    printf("[main] frames_dir     : %s\n", cfg.frames_dir);
    printf("[main] roi             : x=%d y=%d w=%d h=%d\n",
           cfg.roi_x, cfg.roi_y, cfg.roi_w, cfg.roi_h);
    printf("[main] pixel_threshold : %d\n", cfg.pixel_threshold);
    printf("[main] uart_device     : %s\n", cfg.uart_device);
    printf("[main] tcp             : %s:%d\n", cfg.tcp_host, cfg.tcp_port);
    printf("[main] log_file        : %s\n", cfg.log_file);
    printf("[main] fpga_sim        : %s\n", cfg.use_fpga_sim ? "ON" : "OFF");
    printf("-------------------------------------------------\n");

    /* Open subsystems */
    int uart_fd = uart_open(cfg.uart_device);
    if (uart_fd < 0)
        fprintf(stderr, "[main] UART open failed (%s) — alerts skipped\n",
                cfg.uart_device);

    int log_fd = logger_init(cfg.log_file);
    if (log_fd < 0)
        fprintf(stderr, "[main] log open failed (%s) — logging skipped\n",
                cfg.log_file);

    /* Startup banner to UART */
    if (uart_fd >= 0)
        uart_send(uart_fd, "\r\n[MOTION_DETECT] System started\r\n");

    /* Build engine context */
    EngineCtx ctx;
    snprintf(ctx.frames_dir, sizeof(ctx.frames_dir), "%s", cfg.frames_dir);
    ctx.roi.x          = cfg.roi_x;
    ctx.roi.y          = cfg.roi_y;
    ctx.roi.width      = cfg.roi_w;
    ctx.roi.height     = cfg.roi_h;
    ctx.pixel_threshold = cfg.pixel_threshold;
    ctx.use_fpga_sim   = cfg.use_fpga_sim;
    ctx.uart_fd        = uart_fd;
    snprintf(ctx.tcp_host, sizeof(ctx.tcp_host), "%s", cfg.tcp_host);
    ctx.tcp_port       = cfg.tcp_port;
    ctx.log_fd         = log_fd;

    int result = engine_run(&ctx);

    /* Cleanup */
    if (uart_fd >= 0) {
        uart_send(uart_fd, "[MOTION_DETECT] System shutdown\r\n");
        uart_close(uart_fd);
    }
    logger_close(log_fd);

    printf("=================================================\n");
    printf("[main] processed %d frame pair(s) — exit 0\n",
           result < 0 ? 0 : result);

    return result < 0 ? 1 : 0;
}
