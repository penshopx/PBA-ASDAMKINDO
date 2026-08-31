import { motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

export function Scene3() {
  const roles = ['Site manager', 'Estimator', 'Supervisor'];
  return (
    <motion.section className="absolute inset-0 overflow-hidden" initial={{ clipPath: 'circle(0% at 88% 20%)' }} animate={{ clipPath: 'circle(150% at 88% 20%)' }} exit={{ clipPath: 'circle(0% at 15% 80%)', opacity: 0 }} transition={{ duration: 1, ease }}>
      <div className="absolute left-[8vw] top-[15vh] z-10">
        <motion.div className="video-mono mb-[2.8vh] text-[1vw] font-bold text-[#307b6c]" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .35, duration: .45, ease }}>UNTUK PERUSAHAAN / 02</motion.div>
        <motion.h2 className="video-display max-w-[44vw] text-[5.7vw] font-bold leading-[.92] text-[#173743]" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5, duration: .7, ease }}>Talenta yang<br /><span className="text-[#307b6c]">lebih relevan.</span></motion.h2>
        <motion.p className="mt-[3vh] max-w-[28vw] text-[1.4vw] leading-[1.25] text-[#687778]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15, duration: .6 }}>Kebutuhan proyek bertemu profil yang memahami pekerjaan.</motion.p>
      </div>
      <motion.div className="absolute right-[7vw] top-[13vh] z-10 h-[64vh] w-[40vw] border border-[#173743]/15 bg-[#f7f4ed]/90 p-[1.3vw] shadow-[1vw_1vw_0_#f5a524]" initial={{ opacity: 0, x: 70, rotate: 3 }} animate={{ opacity: 1, x: 0, rotate: 0 }} transition={{ delay: .45, duration: 1, type: 'spring', stiffness: 145, damping: 20 }}>
        <div className="flex items-center justify-between border-b border-[#173743]/15 pb-[1vw]"><span className="video-mono text-[.7vw] font-bold text-[#173743]/55">TALENT POOL / KEBUTUHAN PROYEK</span><span className="rounded-full bg-[#307b6c]/15 px-[.7vw] py-[.35vw] text-[.7vw] font-bold text-[#307b6c]">profil relevan</span></div>
        <motion.div className="relative mt-[4vh] h-[16vh] overflow-hidden bg-[#173743]" initial={{ scaleX: 0, originX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.0, duration: .7, ease }}>
          <img className="video-cutout absolute bottom-[-4vh] right-[1vw] h-[26vh] w-[14vw] object-contain object-bottom" src={`${import.meta.env.BASE_URL}video/company-team.png`} alt="" />
          <div className="absolute left-[1.4vw] top-[2vh] max-w-[15vw] text-[#fbfaf6]"><div className="video-mono text-[.65vw] font-bold text-[#f5a524]">NEED / KEBUTUHAN PROYEK</div><div className="video-display mt-[1vh] text-[1.7vw] font-bold leading-none">Orang yang<br />siap di proyek.</div></div>
        </motion.div>
        <div className="mt-[3vh] space-y-[1.1vh]">
          {roles.map((role, index) => (
            <motion.div key={role} className="flex items-center justify-between border-b border-[#173743]/10 pb-[1vh]" initial={{ opacity: 0, x: 25 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.45 + index * .22, duration: .5, ease }}>
              <div className="flex items-center gap-[.8vw]"><div className={`h-[2.4vw] w-[2.4vw] rounded-full ${index === 1 ? 'bg-[#f5a524]' : 'bg-[#307b6c]'} grid place-items-center text-[.9vw] font-bold text-[#173743]`}>{['AR', 'DN', 'YS'][index]}</div><div><div className="text-[1vw] font-bold text-[#173743]">{role}</div><div className="text-[.76vw] text-[#687778]">{['lapangan', 'perencanaan', 'pengawasan'][index]}</div></div></div>
              <div className="video-mono text-[.65vw] font-bold text-[#307b6c]">RELEVAN</div>
            </motion.div>
          ))}
        </div>
        <motion.div className="absolute bottom-[1.4vw] left-[1.4vw] right-[1.4vw] flex items-center justify-between border-t border-[#173743]/15 pt-[1vw]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.25, duration: .5 }}>
          <span className="text-[.78vw] text-[#687778]">Kriteria dibaca dari kebutuhan nyata.</span><span className="video-mono text-[.68vw] font-bold text-[#173743]">PBA / MATCH</span>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}