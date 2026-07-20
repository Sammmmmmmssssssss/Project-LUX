//go:build linux

package main

import (
	"log"
	"os"
	"unsafe"
	"golang.org/x/sys/unix"
)

// openUtun is named for compatibility with tun_darwin.go.
// On Linux, it creates a standard /dev/net/tun interface.
func openUtun() (*os.File, string) {
	fd, err := unix.Open("/dev/net/tun", os.O_RDWR, 0)
	if err != nil {
		log.Fatalf("[LUX] failed to open /dev/net/tun: %v", err)
	}

	var req struct {
		Name  [16]byte
		Flags uint16
		pad   [22]byte
	}
	// IFF_TUN (0x0001) | IFF_NO_PI (0x1000)
	req.Flags = 0x0001 | 0x1000 
	copy(req.Name[:], "lux%d")

	_, _, errno := unix.Syscall(unix.SYS_IOCTL, uintptr(fd), unix.TUNSETIFF, uintptr(unsafe.Pointer(&req)))
	if errno != 0 {
		log.Fatalf("[LUX] TUNSETIFF failed: %v", errno)
	}

	nameLen := 0
	for i, b := range req.Name {
		if b == 0 {
			nameLen = i
			break
		}
	}
	name := string(req.Name[:nameLen])

	return os.NewFile(uintptr(fd), name), name
}

// readTun reads a packet from the TUN interface.
func readTun(tun *os.File, buf []byte) ([]byte, error) {
	n, err := tun.Read(buf)
	if err != nil {
		return nil, err
	}
	return buf[:n], nil
}

// writeTun writes a packet to the TUN interface.
func writeTun(tun *os.File, pkt []byte, buf []byte) error {
	_, err := tun.Write(pkt)
	return err
}
