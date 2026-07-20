import { useState, useEffect } from 'react'

export default function FECSimulator() {
  const [packet, setPacket] = useState('HELLO_LUX_PROTOCOL')
  const [blocks, setBlocks] = useState<{data: string, parity: string}[]>([])

  useEffect(() => {
    // Simulate chunking and parity generation
    const chunked = []
    let currentData = ""
    for (let i = 0; i < packet.length; i++) {
      currentData += packet[i]
      if (currentData.length === 8 || i === packet.length - 1) {
        // Pad data to simulate 223 byte block (visually scaled down)
        const displayData = currentData.padEnd(8, '_')
        // Generate pseudo-parity
        const parity = Array.from({length: 4}, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('')
        chunked.push({ data: displayData, parity })
        currentData = ""
      }
    }
    setBlocks(chunked)
  }, [packet])

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-medium text-ink mb-2">In-Place RS(255, 223) FEC</h2>
        <p className="text-muted text-sm max-w-3xl leading-relaxed">
          Because free-space optics are susceptible to atmospheric scattering, LUX integrates forward error correction.
          The 1500-byte IPv4 MTU is automatically chunked into 223-byte blocks and encoded into 255-byte shards without triggering GC.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-muted mb-2">INPUT PACKET DATA</label>
          <input 
            type="text" 
            value={packet}
            onChange={(e) => setPacket(e.target.value.toUpperCase())}
            className="w-full bg-ink/5 border border-ink/20 rounded-md px-4 py-2 text-ink font-mono text-sm focus:outline-none focus:border-ink/40"
            maxLength={32}
          />
        </div>

        <div className="space-y-3 pt-4">
          <label className="block text-xs font-mono text-muted">ENCODED SHARDS (RS Blocks)</label>
          {blocks.map((block, i) => (
            <div key={i} className="flex flex-col md:flex-row rounded-md overflow-hidden border border-ink/20 text-sm font-mono">
              <div className="flex-1 bg-ink/10 p-3 flex items-center justify-between">
                <span className="text-muted">DATA [{i}]</span>
                <span className="text-ink/80 tracking-[0.2em]">{block.data}</span>
              </div>
              <div className="bg-orange-950/40 p-3 flex items-center justify-between border-t md:border-t-0 md:border-l border-ink/20 md:w-48">
                <span className="text-orange-500/50">PARITY</span>
                <span className="text-orange-400">{block.parity}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mt-8">
        <div className="p-4 bg-ink/5 rounded border border-ink/20">
          <div className="text-xs text-muted mb-1">Data Symbols</div>
          <div className="text-xl font-mono text-ink">223 bytes</div>
        </div>
        <div className="p-4 bg-ink/5 rounded border border-ink/20">
          <div className="text-xs text-muted mb-1">Parity Symbols</div>
          <div className="text-xl font-mono text-orange-400">32 bytes</div>
        </div>
      </div>
    </div>
  )
}
