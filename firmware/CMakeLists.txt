cmake_minimum_required(VERSION 3.13)

# Initialize pico-sdk
include(pico_sdk_import.cmake OPTIONAL)

project(lux_firmware C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

# Initialize the Raspberry Pi Pico SDK
pico_sdk_init()

add_executable(lux_firmware
    src/main.c
    src/lux_tx.c
    src/lux_rx.c
    src/usb_descriptors.c
)

# Generate PIO headers
pico_generate_pio_header(lux_firmware ${CMAKE_CURRENT_LIST_DIR}/pio/manchester_tx.pio)
pico_generate_pio_header(lux_firmware ${CMAKE_CURRENT_LIST_DIR}/pio/manchester_rx.pio)

target_include_directories(lux_firmware PRIVATE ${CMAKE_CURRENT_LIST_DIR}/src)

target_link_libraries(lux_firmware
    pico_stdlib
    hardware_pio
    hardware_dma
    hardware_clocks
    tinyusb_device
    tinyusb_board
)

# Enable USB, disable UART
pico_enable_stdio_usb(lux_firmware 1)
pico_enable_stdio_uart(lux_firmware 0)

# Create map/bin/hex/uf2 file etc.
pico_add_extra_outputs(lux_firmware)
