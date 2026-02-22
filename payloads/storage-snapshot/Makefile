# Build one-shot PS4 storage snapshot payload
# Depends on DirectPackageInstaller payload toolchain bits.

DPI_PAYLOAD_DIR ?= /tmp/DirectPackageInstaller/Payload
CC ?= gcc
OBJCOPY ?= objcopy

CFLAGS = -g -mcmodel=small -I$(DPI_PAYLOAD_DIR) -isystem $(DPI_PAYLOAD_DIR)/freebsd-headers \
  -nostdinc -nostdlib -fno-stack-protector -static -fPIE -ffreestanding
LDFLAGS = -Wl,-gc-sections

all: payload.bin

$(DPI_PAYLOAD_DIR)/lib/lib.a:
	$(MAKE) -C $(DPI_PAYLOAD_DIR)/lib

payload.elf: $(DPI_PAYLOAD_DIR)/lib/lib.a main.c
	$(CC) $(CFLAGS) \
	  $(DPI_PAYLOAD_DIR)/lib/lib.a \
	  main.c \
	  $(DPI_PAYLOAD_DIR)/info.c \
	  $(DPI_PAYLOAD_DIR)/ps4-libjbc/*.c \
	  $(LDFLAGS) \
	  -o payload.elf

payload.bin: payload.elf
	$(OBJCOPY) payload.elf \
	  --only-section .text --only-section .data --only-section .bss --only-section .rodata \
	  -O binary payload.bin

clean:
	rm -f payload.elf payload.bin
