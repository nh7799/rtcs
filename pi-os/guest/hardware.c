#define _POSIX_C_SOURCE 200809L
#include "initio.h"
#include "wiringPi.h"

#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

enum { REGISTER = 1, MOTORS, LED, RELEASE };
static const volatile int32_t *sensors;
static int channel = -1;
static int registered_cleanup;

static void event(int32_t type, int32_t left, int32_t right) {
    if (channel < 0) return;
    int32_t message[] = {type, (int32_t)getpid(), left, right};
    send(channel, message, sizeof(message), MSG_DONTWAIT);
}

void initio_Init(void) {
    if (channel >= 0) return;
    int fd = open("/run/initio-lab/sensors", O_RDONLY | O_CLOEXEC);
    if (fd >= 0) {
        void *mapping = mmap(NULL, 5 * sizeof(int32_t), PROT_READ, MAP_SHARED, fd, 0);
        if (mapping != MAP_FAILED) sensors = mapping;
        close(fd);
    }
    struct sockaddr_un address = {.sun_family = AF_UNIX, .sun_path = "/run/initio-lab/controller"};
    channel = socket(AF_UNIX, SOCK_DGRAM | SOCK_CLOEXEC, 0);
    if (channel >= 0 && connect(channel, (struct sockaddr *)&address, sizeof(address)) != 0) {
        close(channel);
        channel = -1;
    }
    if (!registered_cleanup && atexit(initio_Cleanup) == 0) registered_cleanup = 1;
    event(REGISTER, 0, 0);
}

void initio_Cleanup(void) {
    if (channel >= 0) {
        event(RELEASE, 0, 0);
        close(channel);
        channel = -1;
    }
    if (sensors) {
        munmap((void *)sensors, 5 * sizeof(int32_t));
        sensors = NULL;
    }
}

int initio_IrLeft(void) { return sensors ? sensors[0] : 1; }
int initio_IrRight(void) { return sensors ? sensors[1] : 1; }
int initio_IrLineLeft(void) { return sensors ? sensors[2] : 0; }
int initio_IrLineRight(void) { return sensors ? sensors[3] : 0; }
unsigned int initio_UsGetDistance(void) { return sensors ? (unsigned int)sensors[4] : 0; }
void initio_Stop(void) { event(MOTORS, 0, 0); }
void initio_DriveForward(int8_t speed) { event(MOTORS, speed, speed); }
void initio_DriveReverse(int8_t speed) { event(MOTORS, -speed, -speed); }
void initio_SpinLeft(int8_t speed) { event(MOTORS, -speed, speed); }
void initio_SpinRight(int8_t speed) { event(MOTORS, speed, -speed); }
void initio_TurnForward(int8_t left, int8_t right) { event(MOTORS, left, right); }

void delay(unsigned int ms) {
    struct timespec remaining = {ms / 1000, (ms % 1000) * 1000000L};
    while (nanosleep(&remaining, &remaining) != 0 && errno == EINTR) { }
}

unsigned int millis(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return (unsigned int)(now.tv_sec * 1000UL + now.tv_nsec / 1000000UL);
}

void pinMode(int pin, int mode) { (void)pin; (void)mode; }
void digitalWrite(int pin, int value) { if (pin == 37) event(LED, value != 0, 0); }
