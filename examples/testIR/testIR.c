/* Virtual Initio Lab practice sample. Not the lecturer's original. */
#include <curses.h>
#include <initio.h>
#include <wiringPi.h>

int main(void)
{
    int ch = 0;
    initio_Init();
    initscr();
    noecho();
    cbreak();
    nodelay(stdscr, TRUE);
    keypad(stdscr, TRUE);

    while (ch != 'q') {
        int left = initio_IrLeft();
        int right = initio_IrRight();

        if (left == 0 && right == 0) {
            initio_DriveForward(100);
        } else {
            initio_DriveForward(0);
        }

        mvprintw(0, 0, "Front left: %d  Front right: %d", left, right);
        mvprintw(1, 0, "Obstacle test | q to quit");
        refresh();
        delay(100);
        ch = getch();
    }

    initio_Cleanup();
    endwin();
    return 0;
}
