/* tcp_client.c - TCP alert client */
#include "tcp_client.h"

#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <string.h>
#include <stdint.h>

int tcp_connect(const char *host, int port)
{
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return -1;

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port   = htons((uint16_t)port);

    if (inet_pton(AF_INET, host, &addr.sin_addr) != 1) {
        close(fd);
        return -1;
    }

    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(fd);
        return -1;
    }

    return fd;
}

int tcp_send(int fd, const char *msg)
{
    if (fd < 0 || !msg) return -1;
    size_t  len  = strlen(msg);
    /* MSG_NOSIGNAL prevents SIGPIPE on broken connection */
    ssize_t sent = send(fd, msg, len, MSG_NOSIGNAL);
    return (sent == (ssize_t)len) ? 0 : -1;
}

void tcp_close(int fd)
{
    if (fd >= 0) {
        shutdown(fd, SHUT_RDWR);
        close(fd);
    }
}
