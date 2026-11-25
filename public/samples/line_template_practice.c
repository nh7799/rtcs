/* Virtual Initio Lab practice template. Not the lecturer's original. */
#include <curses.h>
#include <initio.h>

#define WHITE(a) ((a) == 0)
#define BLACK(a) (!WHITE(a))

int main(void)
{
    int ch = 0;
    initio_Init();
    initscr();
    nodelay(stdscr, TRUE);

    while (ch != 'q') {
        int lfL = 0; /* TODO: read left floor sensor */
        int lfR = 0; /* TODO: read right floor sensor */

        if (initio_IrLeft() || initio_IrRight()) {
            initio_Stop();
        } else if (1) { /* TODO: test the front/left/right floor states */
            /* TODO: command the motors */
        } else if (1) {
            /* TODO: command the motors */
        } else if (1) {
            /* TODO: command the motors */
        } else {
            /* TODO: handle lost line */
        }

        mvprintw(0, 0, "Floor left: %d  Floor right: %d", lfL, lfR);
        refresh();
        ch = getch();
    }

    initio_Cleanup();
    endwin();
    return 0;
}
