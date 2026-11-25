/* Practice starter for Tutorial 1, Exercises 2 and 3. */
#include <stdio.h>

#define MAXNUM(a, b) 0 /* TODO: return the greater value */
#define BIT12(a) 0     /* TODO: extract bit 12, counting from bit 0 */

int main(void)
{
    printf("MAXNUM(8, 3) = %d\n", MAXNUM(8, 3));
    printf("MAXNUM(-8, -3) = %d\n", MAXNUM(-8, -3));
    printf("BIT12(0x1f00) = %u\n", (unsigned int)BIT12(0x1f00));
    printf("BIT12(0x0f00) = %u\n", (unsigned int)BIT12(0x0f00));
    return 0;
}
