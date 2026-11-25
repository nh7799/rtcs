CC = gcc
CFLAGS = -Wall -Werror
LDLIBS = -linitio -lcurses -lwiringPi -lpthread

.PHONY: all run schedule test_compile
all: testIR

testIR: testIR.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

run: testIR
	./testIR

schedule: testIR
	rtcs schedule testIR

test_compile:
	$(CC) $(CFLAGS) -fsyntax-only testIR.c
