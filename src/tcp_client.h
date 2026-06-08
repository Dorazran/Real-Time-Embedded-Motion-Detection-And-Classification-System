/* tcp_client.h - TCP alert client (connects to host:port per alert)
 * Target: ARM Cortex-A15 (QEMU vexpress-a15)
 */
#ifndef TCP_CLIENT_H
#define TCP_CLIENT_H

/* Connects to host (dotted-decimal IPv4) on port.
 * Returns socket fd or -1 on error. */
int  tcp_connect(const char *host, int port);

/* Sends null-terminated msg over open socket. Returns 0 on success. */
int  tcp_send(int fd, const char *msg);

void tcp_close(int fd);

#endif /* TCP_CLIENT_H */
