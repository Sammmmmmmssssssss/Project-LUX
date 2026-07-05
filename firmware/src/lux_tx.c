#include "hardware/pio.h"
#include "hardware/dma.h"
#include "hardware/clocks.h"
#include "manchester_tx.pio.h"

#define LASER_PIN 15
#define BUF_LEN_WORDS 1024

extern uint32_t tx_fifo[BUF_LEN_WORDS]; // Provided by main.c or DMA handler

void lux_tx_init(PIO pio, uint sm) {
    uint offset = pio_add_program(pio, &manchester_tx_program);
    pio_sm_config c = manchester_tx_program_get_default_config(offset);
    
    sm_config_set_sideset_pins(&c, LASER_PIN);
    sm_config_set_out_shift(&c, false, true, 32); // MSB-first, autopull at 32 bits
    pio_gpio_init(pio, LASER_PIN);
    pio_sm_set_consecutive_pindirs(pio, sm, LASER_PIN, 1, true);
    
    // sys_clk = 125 MHz, target SM clk = 8 MHz -> divider = 15.625
    float div = (float)clock_get_hz(clk_sys) / 8000000.0f;
    sm_config_set_clkdiv(&c, div);
    
    pio_sm_init(pio, sm, offset, &c);
    pio_sm_set_enabled(pio, sm, true);
}

void lux_tx_dma_init(PIO pio, uint sm, int dma_chan, uint32_t* fifo_ptr) {
    dma_channel_config dc = dma_channel_get_default_config(dma_chan);
    channel_config_set_transfer_data_size(&dc, DMA_SIZE_32);
    channel_config_set_read_increment(&dc, true);
    channel_config_set_write_increment(&dc, false);
    channel_config_set_dreq(&dc, pio_get_dreq(pio, sm, true)); // TX DREQ
    
    dma_channel_configure(
        dma_chan, &dc,
        &pio->txf[sm], // write: PIO TX FIFO
        fifo_ptr, // read: USB bulk-out buffer / application FIFO
        BUF_LEN_WORDS,
        false
    );
}
