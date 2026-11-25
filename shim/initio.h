#ifndef VIRTUAL_INITIO_H
#define VIRTUAL_INITIO_H
#include <stdint.h>
void initio_Init(void);
void initio_Cleanup(void);
int initio_IrLeft(void);
int initio_IrRight(void);
int initio_IrLineLeft(void);
int initio_IrLineRight(void);
unsigned int initio_UsGetDistance(void);
void initio_Stop(void);
void initio_DriveForward(int8_t speed);
void initio_DriveReverse(int8_t speed);
void initio_SpinLeft(int8_t speed);
void initio_SpinRight(int8_t speed);
void initio_TurnForward(int8_t left, int8_t right);
#endif
