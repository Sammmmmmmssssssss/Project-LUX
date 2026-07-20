#include "tusb_config.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "hardware/dma.h"
#include "tusb.h"

extern void lux_tx_init(PIO pio, uint sm);
extern void lux_rx_init(PIO pio, uint sm);
extern void lux_tx_dma_init(PIO pio, uint sm, int dma_chan, uint32_t* fifo_ptr);
extern void lux_rx_dma_init(PIO pio, uint sm, int dma_chan, uint8_t* fifo_ptr);

#define TX_BUF_WORDS 1024    // matches existing tx_fifo size
#define RX_BUF_BYTES 4096    // matches existing rx_fifo size

uint32_t tx_fifo[TX_BUF_WORDS];
uint8_t  rx_fifo[RX_BUF_BYTES];

int dma_tx_chan;
int dma_rx_chan;

// ── TX Path: USB -> PIO ─────────────────────────────────────────
// Called by TinyUSB when the host sends data on the OUT endpoint.
// The 'buffer' pointer is the USB endpoint buffer (no copy needed).
void tud_vendor_rx_cb(uint8_t itf, uint8_t const* buffer, uint16_t bufsize) {
    (void)itf;

    // The USB data is already Manchester-encoded LUX frames.
    // Copy to tx_fifo (word-aligned for 32-bit PIO TX DMA).
    uint32_t words = (bufsize + 3) / 4;  // round up to nearest word
    // Zero-extend the copy (USB gives 64-byte chunks, may not be word-aligned)
    for (uint32_t i = 0; i < words; i++) {
        tx_fifo[i] = 0;
    }
    memcpy(tx_fifo, buffer, bufsize);

    // Stop any previous TX DMA transfer and re-trigger with new count.
    dma_channel_abort(dma_tx_chan);
    dma_channel_set_trans_count(dma_tx_chan, words, false);
    dma_channel_set_read_addr(dma_tx_chan, tx_fifo, true);  // 'true' = start
}

// ── RX Path: PIO -> USB ─────────────────────────────────────────
// Called by TinyUSB when the IN endpoint completes a transmit.
// This signals that we can push more data.
static bool rx_dma_done = false;
void tud_vendor_tx_cb(uint8_t itf) {
    (void)itf;
    rx_dma_done = true;
}

int main(void) {
    board_init();
    tusb_init();

    PIO pio = pio0;

    // Init TX PIO + DMA (DMA starts in stopped state — no trigger yet)
    lux_tx_init(pio, 0);
    dma_tx_chan = dma_claim_unused_channel(true);
    lux_tx_dma_init(pio, 0, dma_tx_chan, tx_fifo);
    dma_channel_abort(dma_tx_chan);  // ensure stopped until USB data arrives

    // Init RX PIO + DMA (circular/continuous mode)
    lux_rx_init(pio, 1);
    dma_rx_chan = dma_claim_unused_channel(true);
    lux_rx_dma_init(pio, 1, dma_rx_chan, rx_fifo);

    // Configure RX DMA for circular mode: keep writing until aborted.
    // RP2040 DMA wraps when buffer end is reached if DEST_ADDR MODULO is set.
    // Simpler approach: use a control block chain or just let it run full and
    // check transfer count. We'll use polling for simplicity:
    // Start RX DMA with full buffer count — it decrements from 4096 to 0.
    dma_channel_set_trans_count(dma_rx_chan, RX_BUF_BYTES, false);
    dma_channel_start(dma_rx_chan);

    while (1) {
        tud_task();  // process USB events (calls tud_vendor_rx_cb etc.)

        // ── RX path: check if DMA has collected data ──────────────
        uint32_t remaining = dma_channel_hw_addr(dma_rx_chan)->transfer_count;
        uint32_t rx_count  = RX_BUF_BYTES - remaining;

        if (rx_count >= 64) {  // USB packet threshold
            // Push to USB IN endpoint (blocks if NAK'd, returns bytes queued)
            uint32_t sent = tud_vendor_write(rx_fifo, rx_count);
            if (sent > 0) {
                // Re-queue RX DMA from start for next batch
                dma_channel_abort(dma_rx_chan);
                dma_channel_set_trans_count(dma_rx_chan, RX_BUF_BYTES, false);
                dma_channel_set_read_addr(dma_rx_chan, rx_fifo, false);
                dma_channel_start(dma_rx_chan);
            }
        }
    }
}
