/* Practice adaptation of Tutorial 1, Exercise 1. */
#include <stdio.h>
#include <stdlib.h>

void PowersOfTwo(void)
{
    int pot = 1;
    int count = 0;

    while (pot < 10000) {
        fprintf(stdout, "2 ^ %d = %d\n", count, pot);
        count++;
        pot = pot * 2;
    }
}

int main(void)
{
    PowersOfTwo();
    return EXIT_SUCCESS;
}
