#ifndef VIRTUAL_CURSES_H
#define VIRTUAL_CURSES_H
#include <stdbool.h>
#define TRUE 1
#define FALSE 0
#define OK 0
#define ERR (-1)
typedef struct { int unused; } WINDOW;
extern WINDOW *stdscr;
WINDOW *initscr(void);
int noecho(void);
int cbreak(void);
int nodelay(WINDOW *window, bool enabled);
int keypad(WINDOW *window, bool enabled);
int mvprintw(int y, int x, const char *format, ...);
int printw(const char *format, ...);
int getch(void);
int refresh(void);
int clear(void);
int erase(void);
int endwin(void);
#endif
