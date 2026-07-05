// tun_darwin.go — Project LUX
// macOS utun interface creation via PF_SYSTEM / SYSPROTO_CONTROL socket.
//
// Why NOT /dev/net/tun: That is Linux-only. macOS exposes the kernel TUN
// driver through a private socket control interface. The sequence:
//   1. Open AF_SYSTEM / SOCK_DGRAM / SYSPROTO_CONTROL socket
//   2. Resolve the control ID for "com.apple.net.utun_control" via ioctl
//   3. Connect with Unit=0 (kernel picks the next free utunN interface)
//   4. Read back the assigned name with getsockopt(UTUN_OPT_IFNAME)
//   5. Wrap the fd in an *os.File for standard Read/Write calls
//
// After openUtun() returns, configure the interface from a shell:
//   sudo ifconfig utun<N> 10.0.0.1 10.0.0.2 up
//   sudo route add -net 10.0.0.0/24 -interface utun<N>
//
// Read/Write note: macOS prepends a 4-byte protocol-family header to every
// packet. Strip the first 4 bytes on Read; prepend AF_INET (0x00000002) on Write.

//go:build darwin

package main

import (
	"log"
	"os"

	"golang.org/x/sys/unix"
)

const (
	// SYSPROTO_CONTROL is the socket protocol for kernel control sockets.
	// Defined in <sys/socket.h> as 2, but not exported by the unix package.
	sysprotoControl = 2

	// UTUN_OPT_IFNAME is the getsockopt option to retrieve the assigned
	// interface name. Defined in <net/if_utun.h> as 2.
	utunOptIfname = 2
)

// openUtun creates a macOS utun virtual network interface.
// Returns the open *os.File and the kernel-assigned interface name (e.g. "utun3").
// Calls log.Fatalf on any syscall failure — no partial state to clean up.
func openUtun() (*os.File, string) {
	// Step 1: Open the kernel control socket.
	fd, err := unix.Socket(unix.AF_SYSTEM, unix.SOCK_DGRAM, sysprotoControl)
	if err != nil {
		log.Fatalf("[LUX] utun socket: %v", err)
	}

	// Step 2: Resolve the numeric control ID for the utun control name.
	// The kernel assigns a dynamic ID at boot; we must look it up via ioctl.
	var info unix.CtlInfo
	copy(info.Name[:], "com.apple.net.utun_control")
	if err := unix.IoctlCtlInfo(fd, &info); err != nil {
		log.Fatalf("[LUX] ctl_info ioctl: %v", err)
	}

	// Step 3: Connect to the utun control, unit 0 = kernel picks next free utunN.
	sc := &unix.SockaddrCtl{
		ID:   info.Id,
		Unit: 0,
	}
	if err := unix.Connect(fd, sc); err != nil {
		log.Fatalf("[LUX] connect utun: %v", err)
	}

	// Step 4: Retrieve the assigned interface name.
	name, err := unix.GetsockoptString(fd, sysprotoControl, utunOptIfname)
	if err != nil {
		log.Fatalf("[LUX] getsockopt UTUN_OPT_IFNAME: %v", err)
	}

	// Step 5: Wrap the raw fd in an *os.File for Read/Write compatibility.
	f := os.NewFile(uintptr(fd), "utun")
	return f, name
}
