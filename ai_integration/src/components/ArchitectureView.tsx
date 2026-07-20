import { motion } from 'framer-motion'

export default function ArchitectureView() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-medium text-ink mb-2">Photonic IP Network Architecture</h2>
        <p className="text-muted text-sm max-w-3xl leading-relaxed">
          Project LUX is a high-speed, bare-metal Photonic IP Network. It completely bypasses standard RF, Wi-Fi, and Ethernet, transmitting raw IPv4 packets over an invisible 2 MHz Infrared Light beam.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ArchCard 
          title="Go Kernel Layer"
          badge="Host Daemon"
          description="Zero-allocation datapath mapped directly to virtual TUN interfaces. Uses L1-padded SPSC ring buffers to completely eliminate SMP false-sharing."
          items={["SPSC Ring Buffers", "No GC Jitter", "Direct UTUN bridging"]}
        />
        <ArchCard 
          title="RP2040 Hardware"
          badge="Microcontroller"
          description="CPU-less optical routing. Hardware DMA channels bridge USB Bulk packets directly into the PIO state machine FIFOs."
          items={["Direct DMA Bridging", "USB Bulk Endpoints", "Dual-core ARM"]}
        />
        <ArchCard 
          title="Analog Front-End"
          badge="Transceiver"
          description="High-speed TIA and comparator setup. Uses precise capacitive feedback loop to prevent ringing and maintain 2MHz bandwidth."
          items={["OPA380 TIA", "TLV3501 Comparator", "1.3pF Feedback Loop"]}
        />
      </div>

      <div className="mt-8 p-6 bg-ink/5 rounded-lg border border-ink/20/50">
        <h3 className="text-sm font-medium text-ink/80 mb-4 font-mono tracking-wider">DATAPATH FLOW</h3>
        <div className="flex flex-col md:flex-row items-center justify-between text-xs font-mono text-muted gap-4">
          <div className="p-3 bg-ink/10 rounded border border-ink/20 w-full md:w-auto text-center">IPv4 Packet (Host)</div>
          <motion.div 
            animate={{ x: [0, 5, 0] }} 
            transition={{ repeat: Infinity, duration: 1.5 }}
          >→</motion.div>
          <div className="p-3 bg-ink/10 rounded border border-ink/20 w-full md:w-auto text-center">Go SPSC Ring (Zero Alloc)</div>
          <motion.div 
            animate={{ x: [0, 5, 0] }} 
            transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }}
          >→</motion.div>
          <div className="p-3 bg-ink/10 rounded border border-ink/20 w-full md:w-auto text-center">USB DMA (RP2040)</div>
          <motion.div 
            animate={{ x: [0, 5, 0] }} 
            transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }}
          >→</motion.div>
          <div className="p-3 bg-ink/10 rounded border border-ink/20 w-full md:w-auto text-center">PIO Manchester Math</div>
          <motion.div 
            animate={{ x: [0, 5, 0] }} 
            transition={{ repeat: Infinity, duration: 1.5, delay: 0.6 }}
          >→</motion.div>
          <div className="p-3 bg-cyan-950/30 text-cyan-500 rounded border border-cyan-900/50 w-full md:w-auto text-center">Infrared LED (2MHz)</div>
        </div>
      </div>
    </div>
  )
}

function ArchCard({ title, badge, description, items }: { title: string, badge: string, description: string, items: string[] }) {
  return (
    <div className="p-5 bg-ink/10/40 border border-ink/20 rounded-xl hover:border-ink/30 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-ink font-medium">{title}</h3>
        <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-1 bg-ink/20 text-muted rounded">{badge}</span>
      </div>
      <p className="text-muted text-sm leading-relaxed mb-4">{description}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center text-xs text-muted font-mono">
            <span className="w-1 h-1 bg-ink/30 rounded-full mr-2" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
