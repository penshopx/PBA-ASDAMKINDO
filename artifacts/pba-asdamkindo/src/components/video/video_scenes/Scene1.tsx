import { motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

export function Scene1() {
  const title = 'Pengalaman\\nyang terlihat.';
  return (
    <motion.section
      className="absolute inset-0 overflow-hidden"
      initial={{ clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      exit={{ clipPath: 'inset(0 0 0 100%)', opacity: 0 }}
      transition={{ duration: 0.85, ease }}
    >
      <div className="absolute left-[8vw] top-[15vh] z-10 max-w-[54vw]">
        <motion.div className="video-mono mb-[3vh] text-[1vw] font-bold text-[#307b6c]" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2, duration: 0.5, ease }}>
          PBA ASDAMKINDO / 01
        </motion.div>
        <h1 className="video-display whitespace-pre-line text-[8.4vw] font-bold leading-[.88] text-[#173743]">
          {title.split('').map((char, index) => (
            <motion.span key={`${char}-${index}`} className="inline-block" initial={{ opacity: 0, y: '1.8vw', rotate: index % 3 === 0 ? -3 : 0 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.32 + index * 0.025, duration: 0.62, ease }}>
              {char === '\n' ? <br /> : char}
            </motion.span>
          ))}
        </h1>
        <motion.p className="mt-[4vh] max-w-[31vw] text-[1.5vw] leading-[1.28] text-[#687778]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.35, duration: 0.55, ease }}>
          Setiap proyek meninggalkan jejak. PBA membantu jejak itu terbaca sebagai kompetensi.
        </motion.p>
      </div>

      <motion.div className="absolute right-[10vw] top-[16vh] z-10 h-[54vh] w-[29vw] rotate-[4deg] border border-[#173743]/15 bg-[#f7f4ed]/80 p-[1.1vw] shadow-[1.2vw_1.4vw_0_#f5a524]" initial={{ opacity: 0, scale: .8, rotate: 12, y: 40 }} animate={{ opacity: 1, scale: 1, rotate: 4, y: 0 }} transition={{ delay: 0.65, duration: 1.05, type: 'spring', stiffness: 150, damping: 18 }}>
        <div className="flex items-center justify-between border-b border-[#173743]/15 pb-[1vw]">
          <div className="video-mono text-[.68vw] font-bold text-[#173743]/60">PROFESSIONAL PASSPORT</div>
          <div className="h-[.8vw] w-[.8vw] rounded-full bg-[#f5a524]" />
        </div>
        <div className="mt-[4vh] flex items-end gap-[1.2vw]">
          <div className="h-[9vw] w-[9vw] rounded-full bg-[#307b6c] p-[.45vw]">
            <img className="video-cutout h-full w-full object-contain object-bottom" src={`${import.meta.env.BASE_URL}video/worker-portrait.png`} alt="" />
          </div>
          <div className="pb-[.4vw]">
            <div className="video-display text-[1.35vw] font-bold text-[#173743]">Profil kompetensi</div>
            <div className="mt-[.4vw] text-[.82vw] text-[#687778]">Pengalaman lapangan, tersusun.</div>
          </div>
        </div>
        <div className="mt-[5vh] grid grid-cols-2 gap-[.7vw]">
          {['Manajemen proyek', 'K3 konstruksi', 'Baca gambar', 'Kolaborasi'].map((label, index) => (
            <motion.div key={label} className="border border-[#173743]/15 bg-[#fbfaf6] px-[.8vw] py-[1vw] text-[.8vw] font-semibold text-[#173743]" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8 + index * .12, duration: .45, ease }}>
              <span className="mr-[.5vw] text-[#307b6c]">0{index + 1}</span>{label}
            </motion.div>
          ))}
        </div>
      </motion.div>
      <motion.div className="absolute bottom-[12vh] left-[8vw] h-px bg-[#173743]/30" initial={{ width: 0 }} animate={{ width: '24vw' }} transition={{ delay: 1.05, duration: .8, ease }} />
      <motion.div className="absolute bottom-[11.4vh] left-[32vw] h-[.55vw] w-[.55vw] rounded-full bg-[#f5a524]" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.8, type: 'spring', stiffness: 300, damping: 20 }} />
    </motion.section>
  );
}