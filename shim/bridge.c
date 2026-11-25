#include "initio.h"
#include "wiringPi.h"
#include "curses.h"
#include <stdarg.h>
#include <stdio.h>

extern void lab_tick(int milliseconds);
extern int lab_sensor(int channel);
extern int lab_key(void);
extern int lab_range(void);
extern unsigned int lab_clock(void);
extern void lab_led(int on);
extern void lab_motor(int left, int right);
extern void lab_terminal(int row, int col, const char *bytes, int length);

static int speed(int value) {
    if (value < 0) return 0;
    return value > 100 ? 100 : value;
}

void initio_Init(void) { lab_motor(0, 0); }
void initio_Cleanup(void) { lab_motor(0, 0); lab_led(0); }
int initio_IrLeft(void) { return lab_sensor(0); }
int initio_IrRight(void) { return lab_sensor(1); }
int initio_IrLineLeft(void) { return lab_sensor(2); }
int initio_IrLineRight(void) { return lab_sensor(3); }
unsigned int initio_UsGetDistance(void) { return (unsigned int)lab_range(); }
void initio_Stop(void) { lab_motor(0, 0); }
void initio_DriveForward(int8_t value) { lab_motor(speed(value), speed(value)); }
void initio_DriveReverse(int8_t value) { lab_motor(-speed(value), -speed(value)); }
void initio_SpinLeft(int8_t value) { lab_motor(-speed(value), speed(value)); }
void initio_SpinRight(int8_t value) { lab_motor(speed(value), -speed(value)); }
void initio_TurnForward(int8_t left, int8_t right) { lab_motor(speed(left), speed(right)); }
void delay(unsigned int ms) { lab_tick(ms > 60000 ? 60000 : (int)ms); }
unsigned int millis(void) { return lab_clock(); }

/* The virtual GPIO bridge exposes only the tutorial's P37 LED. */
static bool led_output;
void pinMode(int pin, int mode) {
    if (pin != 37) return;
    led_output = mode == OUTPUT;
    if (!led_output) lab_led(0);
}
void digitalWrite(int pin, int value) {
    if (pin == 37 && led_output) lab_led(value != LOW);
}

static WINDOW screen;
WINDOW *stdscr = &screen;
static bool nonblocking;
static int cursor_row;
static int cursor_col;

WINDOW *initscr(void) { clear(); return stdscr; }
int noecho(void) { return OK; }
int cbreak(void) { return OK; }
int nodelay(WINDOW *window, bool enabled) { (void)window; nonblocking = enabled; return OK; }
int keypad(WINDOW *window, bool enabled) { (void)window; (void)enabled; return OK; }
int refresh(void) { lab_terminal(-2, 0, NULL, 0); return OK; }
int clear(void) { cursor_row = cursor_col = 0; lab_terminal(-1, 0, NULL, 0); return OK; }
int erase(void) { return clear(); }
int endwin(void) { return refresh(); }

int getch(void) {
    int key;
    /* Always checkpoint, even for non-blocking reads in a tight control loop. */
    do {
        lab_tick(0);
        key = lab_key();
    } while (!nonblocking && key == ERR);
    return key;
}

static int print_at(int row, int col, const char *format, va_list args) {
    char text[512];
    int length = vsnprintf(text, sizeof(text), format, args);
    if (length < 0) return ERR;
    if (length >= (int)sizeof(text)) length = sizeof(text) - 1;
    lab_terminal(row, col, text, length);
    cursor_row = row;
    cursor_col = col + length;
    return OK;
}

int mvprintw(int row, int col, const char *format, ...) {
    va_list args;
    va_start(args, format);
    int result = print_at(row, col, format, args);
    va_end(args);
    return result;
}

int printw(const char *format, ...) {
    va_list args;
    va_start(args, format);
    int result = print_at(cursor_row, cursor_col, format, args);
    va_end(args);
    return result;
}

/* The browser initializes the two Asyncify pointers in this reserved block. */
static uint32_t async_storage[16384];
uint32_t *lab_async_data(void) { return async_storage; }
