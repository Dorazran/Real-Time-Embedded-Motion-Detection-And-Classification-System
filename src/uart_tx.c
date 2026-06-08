/* uart_tx.c - PL011 UART (ttyAMA0) alert transmitter */
#include "uart_tx.h"

#include <fcntl.h>
#include <unistd.h>
#include <termios.h>
#include <string.h>

int uart_open(const char *device)
{
    int fd = open(device, O_WRONLY | O_NOCTTY | O_NDELAY);
    if (fd < 0) return -1;

    struct termios tty;
    if (tcgetattr(fd, &tty) < 0) {
        close(fd);
        return -1;
    }

    /* 115200 8N1, no flow control */
    cfsetospeed(&tty, B115200);
    cfsetispeed(&tty, B115200);
    tty.c_cflag  = (tty.c_cflag & ~CSIZE) | CS8;
    tty.c_cflag &= ~(PARENB | PARODD | CSTOPB);
#ifdef CRTSCTS
    tty.c_cflag &= ~CRTSCTS;
#endif
    tty.c_cflag |=  (CLOCAL | CREAD);
    tty.c_iflag  = 0;
    tty.c_oflag  = 0;
    tty.c_lflag  = 0;
    tty.c_cc[VMIN]  = 1;
    tty.c_cc[VTIME] = 5;

    if (tcsetattr(fd, TCSANOW, &tty) < 0) {
        close(fd);
        return -1;
    }

    return fd;
}

int uart_send(int fd, const char *msg)
{
    if (fd < 0 || !msg) return -1;
    size_t  len     = strlen(msg);
    ssize_t written = write(fd, msg, len);
    return (written == (ssize_t)len) ? 0 : -1;
}

void uart_close(int fd)
{
    if (fd >= 0) close(fd);
}
