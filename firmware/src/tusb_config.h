#ifndef TUSB_CONFIG_H_
#define TUSB_CONFIG_H_

#define CFG_TUSB_MCU            OPT_MCU_RP2040
#define CFG_TUSB_OS             OPT_OS_NONE
#define CFG_TUSB_DEBUG          0

// Enable device stack
#define CFG_TUD_ENABLED         1

// Endpoint 0 size (64 bytes for full-speed)
#define CFG_TUD_ENDPOINT0_SIZE  64

// Vendor class settings — unbuffered mode
#define CFG_TUD_VENDOR          1
#define CFG_TUD_VENDOR_RX_BUFSIZE 0  // direct buffer access in callback
#define CFG_TUD_VENDOR_TX_BUFSIZE 0  // direct buffer access for write

// USB callback function pointers needed
#define CFG_TUD_VENDOR_RX_CB    tud_vendor_rx_cb
#define CFG_TUD_VENDOR_TX_CB    tud_vendor_tx_cb

#endif
