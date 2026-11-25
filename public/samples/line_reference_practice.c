/* Virtual Initio Lab completed practice example. Not lecturer code.
 * Tune the two constants below before compiling your next trial. */
#include <curses.h>
#include <initio.h>

#define FORWARD_SPEED 42
#define TURN_SPEED 38
#define WHITE(a) ((a) == 0)
#define BLACK(a) (!WHITE(a))

int main(void)
{
    int ch = 0;
    initio_Init();
    initscr();
    noecho();
    cbreak();
    nodelay(stdscr, TRUE);

    while (ch != 'q') {
        int left = initio_IrLineLeft();
        int right = initio_IrLineRight();
        int blocked = initio_IrLeft() || initio_IrRight();
        const char *state;

        if (blocked) {
            initio_Stop();
            state = "Obstacle";
        } else if (BLACK(left) && BLACK(right)) {
            initio_DriveForward(FORWARD_SPEED);
            state = "Forward";
        } else if (BLACK(left)) {
            initio_TurnForward(TURN_SPEED / 4, TURN_SPEED);
            state = "Left";
        } else if (BLACK(right)) {
            initio_TurnForward(TURN_SPEED, TURN_SPEED / 4);
            state = "Right";
        } else {
            initio_Stop();
            state = "Line lost";
        }
        mvprintw(0, 0, "Floor left: %d  Floor right: %d", left, right);
        mvprintw(1, 0, "State: %-14s | q to quit", state);
        refresh();
        ch = getch();
    }

    initio_Cleanup();
    endwin();
    return 0;
}
