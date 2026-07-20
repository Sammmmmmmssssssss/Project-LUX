package main

import (
	"bytes"
	"testing"
)

func TestFrameRoundTrip(t *testing.T) {
	payloads := [][]byte{
		[]byte("hello world"),
		make([]byte, 1500), // Max MTU
		{},                 // Zero-byte payload
	}

	for i, payload := range payloads {
		if i == 1 {
			for j := range payload {
				payload[j] = byte(j % 256)
			}
		}

		framed := frame(payload)
		
		if len(framed) != 4+2+len(payload)+4 {
			t.Fatalf("Test %d: expected length %d, got %d", i, 4+2+len(payload)+4, len(framed))
		}

		deframed := deframe(framed)
		if deframed == nil {
			t.Fatalf("Test %d: deframe returned nil", i)
		}

		if !bytes.Equal(payload, deframed) {
			t.Fatalf("Test %d: payload mismatch. Expected %v, got %v", i, payload, deframed)
		}
	}
}

func TestFrameCorruption(t *testing.T) {
	payload := []byte("corrupt me")
	
	// Test Sync corruption
	framed := frame(payload)
	framed[0] ^= 0xFF
	if deframe(framed) != nil {
		t.Fatal("Expected nil on sync corruption")
	}

	// Test Length corruption
	framed = frame(payload)
	framed[5] ^= 0xFF
	if deframe(framed) != nil {
		t.Fatal("Expected nil on length corruption")
	}

	// Test Payload corruption
	framed = frame(payload)
	framed[7] ^= 0xFF // Flip a bit in the payload
	if deframe(framed) != nil {
		t.Fatal("Expected nil on payload corruption (CRC should fail)")
	}

	// Test CRC corruption
	framed = frame(payload)
	framed[len(framed)-1] ^= 0xFF
	if deframe(framed) != nil {
		t.Fatal("Expected nil on CRC corruption")
	}
}

func TestFrameTruncation(t *testing.T) {
	payload := []byte("truncate me")
	framed := frame(payload)

	// Truncate one byte
	if deframe(framed[:len(framed)-1]) != nil {
		t.Fatal("Expected nil on truncated frame")
	}

	// Truncate to just before minimum size
	if deframe(framed[:9]) != nil {
		t.Fatal("Expected nil on < 10 byte frame")
	}
}

func BenchmarkFrame(b *testing.B) {
	payload := make([]byte, 1500)
	buf := make([]byte, maxFrameSize)
	
	b.ReportAllocs()
	b.ResetTimer()
	
	for i := 0; i < b.N; i++ {
		framed := frameInto(buf, payload)
		deframeRaw(framed)
	}
}
