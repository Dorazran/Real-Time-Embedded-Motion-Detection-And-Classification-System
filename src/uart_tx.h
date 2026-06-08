/* uart_tx.h - PL011 UART alert transmitter (/dev/ttyAMA0)
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef UART_TX_H
#define UART_TX_H

/* Opens device and configures 115200 8N1. Returns fd or -1 on error. */
int  uart_open(const char *device);

/* Writes null-terminated msg. Returns 0 on success. */
int  uart_send(int fd, const char *msg);

void uart_close(int fd);

#endif /* UART_TX_H */
