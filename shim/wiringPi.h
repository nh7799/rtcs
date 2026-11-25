#ifndef VIRTUAL_WIRING_PI_H
#define VIRTUAL_WIRING_PI_H
#define INPUT 0
#define OUTPUT 1
#define LOW 0
#define HIGH 1
void delay(unsigned int ms);
unsigned int millis(void);
void pinMode(int pin, int mode);
void digitalWrite(int pin, int value);
#endif
