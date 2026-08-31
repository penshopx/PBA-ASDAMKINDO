import { motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

export function Scene5() {
  return (
    <motion.section className="absolute inset-0 overflow-hidden" initial={{ clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} exit={{ scale: 1.08, opacity: 0, filter: 'blur(10px)' }} transition={{ duration: .9, ease }}>
      <div className="absolute left-[8vw] top-[17vh] z-10">
        <motion.div className="video-mono mb-[3vh] text-[1vw] font-bold text-[#307b6c]" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25, duration: .45, ease }}>PBA ASDAMKINDO / PENUTUP</motion.div>
        <motion.h2 className="video-display max-w-[64vw] text-[7vw] font-bold leading-[.88] text-[#173743]" initial={{ opacity: 0, scale: .9, y: 25 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: .42, duration: 1, type: 'spring', stiffness: 130, damping: 18 }}>
          Dari pengalaman,<br /><span className="text-[#307b6c]">lahir peluang.</span>
        </motion.h2>
        <motion.p className="mt-[4vh] max-w-[34vw] text-[1.5vw] leading-[1.25] text-[#687778]" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: .6, ease }}>Satu ekosistem untuk kompetensi yang terlihat, talenta yang relevan, dan operasi yang terjaga.</motion.p>
      </div>
      <motion.div className="absolute right-[10vw] top-[18vh] grid h-[25vw] w-[25vw] place-items-center rounded-full border border-[#173743]/15 bg-[#f7f4ed] shadow-[1vw_1vw_0_#f5a524]" initial={{ opacity: 0, scale: .35, rotate: -25 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: .6, duration: 1.05, type: 'spring', stiffness: 120, damping: 17 }}>
        <div className="absolute inset-[1.5vw] rounded-full border border-dashed border-[#307b6c]/45" />
        <div className="relative grid h-[7.5vw] w-[7.5vw] place-items-center rounded-[2vw] bg-[#f5a524] shadow-[.5vw_.5vw_0_#173743]"><img className="h-[5vw] w-[5vw]" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" /></div>
        {[
          ['PROFIL', 'left-[1.8vw] top-[5.3vw]'],
          ['TALENT', 'right-[1.5vw] top-[5.3vw]'],
          ['PBA', 'bottom-[2.6vw] left-[9.2vw]'],
        ].map(([label, pos], index) => (
          <motion.div key={label} className={`absolute ${pos} grid h-[4.2vw] w-[4.2vw] place-items-center rounded-full border border-[#173743]/15 bg-[#fbfaf6] text-center`} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.45 + index * .18, duration: .55, type: 'spring', stiffness: 220, damping: 18 }}><span className="video-mono text-[.58vw] font-bold text-[#173743]">{label}</span></motion.div>
        ))}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 400" fill="none" aria-hidden="true"><path d="M106 130L200 200L294 130M200 200L200 300" stroke="#307B6C" strokeWidth="2" strokeDasharray="8 10" opacity=".65" /></svg>
      </motion.div>
      <motion.div className="absolute bottom-[12vh] left-[8vw] right-[8vw] flex items-center justify-between border-t border-[#173743]/20 pt-[2.2vh]" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.85, duration: .65, ease }}>
        <div className="flex items-center gap-[1vw]"><img className="h-[3.2vw] w-[3.2vw]" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" /><div><div className="video-mono text-[.85vw] font-bold text-[#173743]">PBA ASDAMKINDO</div><div className="mt-[.5vh] text-[.75vw] text-[#687778]">Pusat Bina Anggota</div></div></div>
        <div className="video-mono text-[.72vw] font-bold text-[#173743]/55">JALAN DENGAN BUKTI / EKOSISTEM KERJA</div>
      </motion.div>
    </motion.section>
  );
}