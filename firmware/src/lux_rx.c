#include "hardware/pio.h"
#include "hardware/dma.h"
#include "hardware/clocks.h"
#include "manchester_rx.pio.h"

#define RX_PIN 16
#define BUF_LEN_WORDS 1024
#define BUF_LEN_BYTES 4096

extern uint8_t rx_fifo[BUF_LEN_BYTES]; // Provided by main.c or DMA handler

void lux_rx_init(PIO pio, uint sm) {
    uint offset = pio_add_program(pio, &manchester_rx_program);
    pio_sm_config c = manchester_rx_program_get_default_config(offset);
    
    sm_config_set_jmp_pin(&c, RX_PIN);
    sm_config_set_in_pins(&c, RX_PIN);
    pio_gpio_init(pio, RX_PIN);
    pio_sm_set_consecutive_pindirs(pio, sm, RX_PIN, 1, false); // input
    sm_config_set_in_shift(&c, false, true, 8); // MSB-first, autopush @ 8 bits
    
    // sys_clk = 125 MHz, target SM clk = 32 MHz -> divider = 3.90625
    float div = (float)clock_get_hz(clk_sys) / 32000000.0f;
    sm_config_set_clkdiv(&c, div);
    
    pio_sm_init(pio, sm, offset, &c);
    pio_sm_set_enabled(pio, sm, true);
}

void lux_rx_dma_init(PIO pio, uint sm, int dma_chan, uint8_t* fifo_ptr) {
    dma_channel_config dc = dma_channel_get_default_config(dma_chan);
    channel_config_set_transfer_data_size(&dc, DMA_SIZE_8); // We push 8 bits at a time from PIO
    channel_config_set_read_increment(&dc, false);
    channel_config_set_write_increment(&dc, true);
    channel_config_set_dreq(&dc, pio_get_dreq(pio, sm, false)); // RX DREQ
    
    dma_channel_configure(
        dma_chan, &dc,
        fifo_ptr, // write: USB bulk-in buffer / application FIFO
        &pio->rxf[sm], // read: PIO RX FIFO
        BUF_LEN_BYTES,
        false
    );
}
