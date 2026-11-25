/* Tutorial 3 exploration. Use the obstacle-stop sample for CW1 Section 2. */
#include <curses.h>
#include <initio.h>
#include <wiringPi.h>

#define STOP_ON_DARK 0 /* Set to 1 to try the floor detector exercise. */

int main(void)
{
    initio_Init();
    initscr();
    noecho();
    cbreak();
    nodelay(stdscr, TRUE);
    pinMode(37, OUTPUT);

    int led = LOW;
    unsigned int last_flash = millis();
    while (getch() != 'q') {
        unsigned int cm = initio_UsGetDistance();
        int dark = initio_IrLineLeft() || initio_IrLineRight();
        int blocked = initio_IrLeft() || initio_IrRight();
        int command = 100;
        const char *state = "Cruise";

        if (blocked || (cm > 0U && cm <= 50U)) {
            command = 0;
            state = "Obstacle stop";
        } else if (STOP_ON_DARK && dark) {
            command = 0;
            state = "Dark floor stop";
        } else if (cm > 0U && cm <= 100U) {
            command = 70;
            state = "Approaching";
        }
        if (command == 0) initio_Stop();
        else initio_DriveForward(command);

        unsigned int now = millis();
        if (now - last_flash >= 500U) {
            led = !led;
            digitalWrite(37, led);
            last_flash = now;
        }
        mvprintw(0, 0, "Distance: %3u cm (0 = no echo)", cm);
        mvprintw(1, 0, "C state: %-16s  P37: %s", state, led ? "ON " : "OFF");
        refresh();
        delay(50);
    }

    digitalWrite(37, LOW);
    initio_Cleanup();
    endwin();
    return 0;
}
