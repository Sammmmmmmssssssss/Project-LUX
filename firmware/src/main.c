#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "hardware/dma.h"
#include "tusb.h"

// External init functions
extern void lux_tx_init(PIO pio, uint sm);
extern void lux_rx_init(PIO pio, uint sm);
extern void lux_tx_dma_init(PIO pio, uint sm, int dma_chan, uint32_t* fifo_ptr);
extern void lux_rx_dma_init(PIO pio, uint sm, int dma_chan, uint8_t* fifo_ptr);

#define BUF_LEN_WORDS 1024
#define BUF_LEN_BYTES (BUF_LEN_WORDS * 4)

uint32_t tx_fifo[BUF_LEN_WORDS];
uint8_t rx_fifo[BUF_LEN_BYTES];

int dma_tx_chan;
int dma_rx_chan;

int main(void) {
    board_init();
    tusb_init();

    PIO pio = pio0;
    
    // Init TX PIO and DMA
    lux_tx_init(pio, 0);
    dma_tx_chan = dma_claim_unused_channel(true);
    lux_tx_dma_init(pio, 0, dma_tx_chan, tx_fifo);
    
    // Init RX PIO and DMA
    lux_rx_init(pio, 1);
    dma_rx_chan = dma_claim_unused_channel(true);
    lux_rx_dma_init(pio, 1, dma_rx_chan, rx_fifo);

    while (1) {
        tud_task(); // TinyUSB device task
        
        // Example handling (stub) - actual bridging logic goes here.
        // We'd check DMA completions and push to/from TinyUSB bulk endpoints.
    }
}
