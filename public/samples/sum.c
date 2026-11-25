/* Practice adaptation of Tutorial 1, Exercises 4 to 6. */
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>

#define INPUT_BASE 10

static int read_number(const char *text, long *number)
{
    char *end;
    errno = 0;
    *number = strtol(text, &end, INPUT_BASE);
    return end != text && *end == '\0' && errno == 0;
}

int main(int argc, char *argv[])
{
    long a, b;

    if (argc != 3) {
        fprintf(stderr, "Usage: %s number number\n", argv[0]);
        return EXIT_FAILURE;
    }
    if (!read_number(argv[1], &a) || !read_number(argv[2], &b)) {
        fprintf(stderr, "Give two valid base-%d integers.\n", INPUT_BASE);
        return EXIT_FAILURE;
    }
    if ((b > 0 && a > LONG_MAX - b) || (b < 0 && a < LONG_MIN - b)) {
        fprintf(stderr, "The sum is out of range for a long.\n");
        return EXIT_FAILURE;
    }

    printf("Sum (decimal) = %ld\n", a + b);
    return EXIT_SUCCESS;
}
