import { motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

export function Scene2() {
  return (
    <motion.section className="absolute inset-0 overflow-hidden" initial={{ clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} exit={{ clipPath: 'inset(100% 0 0 0)', opacity: 0 }} transition={{ duration: .8, ease }}>
      <div className="absolute left-[8vw] top-[13vh] z-10">
        <motion.div className="video-mono mb-[3vh] text-[1vw] font-bold text-[#ba4037]" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15, duration: .45, ease }}>DARI JEJAK / MENJADI BUKTI</motion.div>
        <motion.h2 className="video-display max-w-[49vw] text-[5.8vw] font-bold leading-[.95] text-[#173743]" initial={{ opacity: 0, y: '2vw' }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3, duration: .7, ease }}>
          Kompetensi tidak<br /><span className="text-[#307b6c]">boleh tersimpan.</span>
        </motion.h2>
      </div>
      <div className="absolute bottom-[12vh] left-[8vw] right-[8vw] z-10 flex items-end justify-between">
        <div className="relative h-[31vh] w-[42vw]">
          <motion.div className="absolute left-0 top-[8vh] h-px w-full bg-[#173743]/35" initial={{ scaleX: 0, originX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: .55, duration: .9, ease }} />
          {[['PENGALAMAN', 'Mulai di lapangan', 'left-0'], ['PERAN', 'Mengasah cara kerja', 'left-[14vw]'], ['BUKTI', 'Siap dipercaya', 'left-[29vw]']].map(([year, label, pos], index) => (
            <motion.div key={year} className={`absolute top-0 ${pos}`} initial={{ opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .85 + index * .28, duration: .5, type: 'spring', stiffness: 250, damping: 18 }}>
              <div className="h-[1.5vw] w-[1.5vw] rounded-full border-[.35vw] border-[#f7f4ed] bg-[#f5a524] shadow-[0_0_0_.15vw_#173743]" />
            <div className="video-mono mt-[2.1vh] text-[.68vw] font-bold text-[#173743]">{year}</div>
              <div className="mt-[.7vh] max-w-[9vw] text-[1vw] font-semibold leading-tight text-[#687778]">{label}</div>
            </motion.div>
          ))}
          <motion.div className="absolute left-[17vw] top-[13vh] w-[22vw] -rotate-3 border border-[#173743]/15 bg-[#f7f4ed] p-[1.2vw] shadow-[.7vw_.7vw_0_#307b6c]" initial={{ opacity: 0, y: 30, rotate: -12 }} animate={{ opacity: 1, y: 0, rotate: -3 }} transition={{ delay: 1.6, duration: .8, type: 'spring', stiffness: 180, damping: 20 }}>
            <div className="flex items-center justify-between"><span className="video-mono text-[.65vw] font-bold text-[#173743]/55">BUKTI PENGALAMAN</span><span className="h-[.8vw] w-[.8vw] rounded-full bg-[#307b6c]" /></div>
            <div className="mt-[1.8vh] h-[.55vw] w-[73%] rounded-full bg-[#173743]/15"><div className="h-full w-[78%] rounded-full bg-[#307b6c]" /></div>
            <div className="mt-[1.4vh] flex gap-[.5vw]"><span className="rounded-full bg-[#f5a524]/25 px-[.7vw] py-[.35vw] text-[.72vw] font-bold text-[#173743]">proyek</span><span className="rounded-full bg-[#307b6c]/15 px-[.7vw] py-[.35vw] text-[.72vw] font-bold text-[#173743]">peran</span></div>
          </motion.div>
        </div>
        <motion.div className="relative h-[34vh] w-[25vw] overflow-hidden border border-[#173743]/10 bg-[#173743] p-[1.6vw] text-[#fbfaf6]" initial={{ opacity: 0, x: 50, rotate: 3 }} animate={{ opacity: 1, x: 0, rotate: 0 }} transition={{ delay: 1.15, duration: .8, type: 'spring', stiffness: 160, damping: 20 }}>
          <div className="video-mono text-[.68vw] font-bold text-[#f5a524]">PROFIL / 0148</div>
          <div className="video-display mt-[4vh] text-[2.25vw] font-bold leading-[.95]">Yang pernah<br />dikerjakan,<br /><span className="text-[#f5a524]">terlihat.</span></div>
          <svg className="absolute bottom-[1.3vw] right-[1.3vw] h-[6vw] w-[8vw]" viewBox="0 0 100 70" fill="none" aria-hidden="true"><path className="video-squiggle" d="M4 58C17 20 28 44 39 19C48 0 61 46 70 21C78 0 88 16 96 4" stroke="#F5A524" strokeWidth="3" strokeLinecap="round" /></svg>
        </motion.div>
      </div>
    </motion.section>
  );
}