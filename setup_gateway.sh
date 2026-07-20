#!/bin/bash
# Project LUX — Linux Internet Gateway Setup Script
# Run this script on the Raspberry Pi that has the internet connection.
# It enables IP forwarding and NAT (masquerading) so the client on the
# other side of the LUX optical link can access the internet.

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Determine the primary internet interface (e.g., wlan0 or eth0)
WAN_IFACE=$(ip route | grep default | sed -e "s/^.*dev.//" -e "s/.proto.*//")
if [ -z "$WAN_IFACE" ]; then
    echo "Error: Could not determine the internet-facing network interface."
    exit 1
fi

LUX_IFACE="lux0" # Default TUN interface created by tun_linux.go

echo "Setting up NAT from $LUX_IFACE -> $WAN_IFACE"

# 1. Enable IP forwarding in the kernel
echo 1 > /proc/sys/net/ipv4/ip_forward

# 2. Configure the LUX interface IP (Host side)
# We assign 10.0.0.1 to the Raspberry Pi's LUX interface.
# (Ensure go_kernel is running first so lux0 exists)
if ip link show $LUX_IFACE > /dev/null 2>&1; then
    ip addr add 10.0.0.1/24 dev $LUX_IFACE
    ip link set $LUX_IFACE up
else
    echo "Warning: $LUX_IFACE not found. Ensure the LUX go_kernel is running first."
    echo "You can run this manually later: sudo ip addr add 10.0.0.1/24 dev $LUX_IFACE && sudo ip link set $LUX_IFACE up"
fi

# 3. Setup iptables for NAT (Masquerade)
# Flush existing rules on the NAT table to avoid duplicates (optional but safe)
# iptables -t nat -F

iptables -t nat -A POSTROUTING -o $WAN_IFACE -j MASQUERADE
iptables -A FORWARD -i $WAN_IFACE -o $LUX_IFACE -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A FORWARD -i $LUX_IFACE -o $WAN_IFACE -j ACCEPT

echo "Internet Gateway Setup Complete!"
echo "--------------------------------------------------------"
echo "On the CLIENT computer (the other end of the laser), run:"
echo "  sudo ifconfig utunX 10.0.0.2 10.0.0.1 up   # (macOS)"
echo "  sudo route add -net 0.0.0.0/0 10.0.0.1     # (Route all traffic to the Pi)"
echo "--------------------------------------------------------"
