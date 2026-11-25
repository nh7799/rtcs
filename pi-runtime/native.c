#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* The trusted mock hardware blocks here until the simulator supplies the next inputs. */
static int bits[4];
static int key = -1;
static int distance;
static unsigned int clock_ms;
static int motors[2];
static int led;
static char screen[24][101];

static void receive_frame(void)
{
    char input[128];
    int next_key;
    if (!fgets(input, sizeof input, stdin)) exit(0);
    if (sscanf(input, "%d %d %d %d %d %d %u",
               &bits[0], &bits[1], &bits[2], &bits[3], &next_key, &distance, &clock_ms) != 7) {
        fputs("Invalid simulator frame.\n", stderr);
        exit(125);
    }
    if (next_key >= 0) key = next_key;
}

__attribute__((constructor))
static void initialise_link(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    puts("@INITIO READY");
    receive_frame();
}

void lab_tick(int milliseconds)
{
    printf("\n@INITIO STEP %d %d %d %d\n", milliseconds, motors[0], motors[1], led);
    receive_frame();
}

int lab_sensor(int channel) { return channel >= 0 && channel < 4 ? bits[channel] : 0; }
int lab_key(void) { int current = key; key = -1; return current; }
int lab_range(void) { return distance; }
unsigned int lab_clock(void) { return clock_ms; }
void lab_led(int on) { led = !!on; }
void lab_motor(int left, int right) { motors[0] = left; motors[1] = right; }

void lab_terminal(int row, int col, const char *bytes, int length)
{
    if (row == -1) {
        memset(screen, 0, sizeof screen);
    } else if (row == -2) {
        int last = 23;
        while (last >= 0 && !screen[last][0]) --last;
        fputs("\n@INITIO TERM ", stdout);
        for (int i = 0; i <= last; ++i) {
            for (int j = 0; screen[i][j]; ++j) printf("%02x", (unsigned char)screen[i][j]);
            if (i < last) fputs("0a", stdout);
        }
        putchar('\n');
    } else if (row >= 0 && row < 24 && col >= 0 && col < 100 && length > 0) {
        int existing = (int)strlen(screen[row]);
        while (existing < col) screen[row][existing++] = ' ';
        if (length > 100 - col) length = 100 - col;
        memcpy(screen[row] + col, bytes, (size_t)length);
    }
}
