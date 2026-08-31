import { motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

export function Scene4() {
  return (
    <motion.section className="absolute inset-0 overflow-hidden" initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} exit={{ clipPath: 'inset(0 0 0 100%)', opacity: 0 }} transition={{ duration: .85, ease }}>
      <div className="absolute left-[8vw] top-[15vh] z-10">
        <motion.div className="video-mono mb-[2.8vh] text-[1vw] font-bold text-[#f5a524]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2, duration: .45, ease }}>EKOSISTEM / 03</motion.div>
        <motion.h2 className="video-display max-w-[45vw] text-[5.7vw] font-bold leading-[.92] text-[#173743]" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35, duration: .7, ease }}>Di belakang<br />setiap <span className="text-[#ba4037]">kemajuan.</span></motion.h2>
        <motion.p className="mt-[3vh] max-w-[28vw] text-[1.4vw] leading-[1.25] text-[#687778]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.05, duration: .55 }}>Ada proses yang rapi. Ada admin yang memastikan semuanya bergerak.</motion.p>
      </div>
      <div className="absolute bottom-[14vh] left-[8vw] flex gap-[1.2vw]">
        {[
          ['01', 'Verifikasi', 'Data dan bukti diperiksa.'],
          ['02', 'Pemetaan', 'Kompetensi tersusun rapi.'],
          ['03', 'Peluang', 'Kebutuhan bertemu orangnya.'],
        ].map(([num, title, copy], index) => (
          <motion.div key={num} className="h-[20vh] w-[18vw] border border-[#173743]/15 bg-[#f7f4ed]/90 p-[1.2vw]" initial={{ opacity: 0, y: 35 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .85 + index * .2, duration: .55, ease }}>
            <div className="video-mono text-[.72vw] font-bold text-[#ba4037]">{num} / OPERASI</div><div className="video-display mt-[3vh] text-[1.8vw] font-bold text-[#173743]">{title}</div><p className="mt-[1vh] text-[.83vw] leading-tight text-[#687778]">{copy}</p>
          </motion.div>
        ))}
      </div>
      <motion.div className="absolute right-[8vw] top-[18vh] h-[54vh] w-[27vw] rotate-[3deg] bg-[#173743] p-[1.8vw] text-[#fbfaf6] shadow-[1.3vw_1.3vw_0_#f5a524]" initial={{ opacity: 0, scale: .84, rotate: 12 }} animate={{ opacity: 1, scale: 1, rotate: 3 }} transition={{ delay: .55, duration: 1, type: 'spring', stiffness: 140, damping: 18 }}>
        <div className="flex items-center gap-[.8vw] border-b border-[#fbfaf6]/20 pb-[1.2vw]"><img className="h-[2.2vw] w-[2.2vw]" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" /><div className="video-mono text-[.7vw] font-bold text-[#f5a524]">PBA ADMIN DESK</div></div>
        <div className="video-display mt-[4vh] text-[2.2vw] font-bold leading-[.95]">Rapi di<br /><span className="text-[#f5a524]">belakang layar.</span></div>
        <div className="mt-[5vh] space-y-[1.7vh]">
          {['Profil menunggu verifikasi', 'Kebutuhan perusahaan aktif', 'Proses berjalan hari ini'].map((item, index) => (
            <motion.div key={item} className="flex items-center gap-[.8vw] border-b border-[#fbfaf6]/15 pb-[1.2vh]" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.45 + index * .2, duration: .45, ease }}><div className="h-[.65vw] w-[.65vw] rounded-full bg-[#f5a524]" /><span className="text-[.9vw] text-[#fbfaf6]/78">{item}</span></motion.div>
          ))}
        </div>
        <div className="absolute bottom-[1.8vw] left-[1.8vw] right-[1.8vw] text-[.7vw] text-[#fbfaf6]/45">PBA ASDAMKINDO · pusat operasi ekosistem</div>
      </motion.div>
    </motion.section>
  );
}