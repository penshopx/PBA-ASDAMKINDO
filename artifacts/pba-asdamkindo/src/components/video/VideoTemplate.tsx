import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const SCENE_DURATIONS = {
  hook: 7500,
  evidence: 8000,
  talent: 9000,
  ecosystem: 8000,
  close: 7500,
};

const ORB_POSITIONS = [
  { left: '54vw', top: '35vh', scale: 1.4, opacity: .16 },
  { left: '9vw', top: '68vh', scale: 1.1, opacity: .13 },
  { left: '81vw', top: '12vh', scale: 1.6, opacity: .15 },
  { left: '74vw', top: '70vh', scale: .85, opacity: .12 },
  { left: '54vw', top: '52vh', scale: 1.25, opacity: .14 },
];

const LINE_POSITIONS = [
  { left: '8vw', top: '82vh', width: '25vw' },
  { left: '8vw', top: '11vh', width: '40vw' },
  { left: '58vw', top: '83vh', width: '30vw' },
  { left: '8vw', top: '87vh', width: '43vw' },
  { left: '8vw', top: '84vh', width: '34vw' },
];

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });
  return (
    <main className="video-root video-grain relative h-screen w-full overflow-hidden bg-[#fbfaf6] text-[#173743]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <motion.div className="video-grid absolute inset-0" animate={{ backgroundPosition: ['0vw 0vh', '4vw 4vw', '0vw 8vh'] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="absolute -left-[15vw] -top-[18vw] h-[55vw] w-[55vw] rounded-full bg-[#f5a524] blur-[7vw]" animate={{ x: ['0vw', '23vw', '5vw'], y: ['0vh', '17vh', '3vh'], scale: [1, 1.1, .95] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute -bottom-[18vw] -right-[12vw] h-[50vw] w-[50vw] rounded-full bg-[#307b6c] blur-[8vw]" animate={{ x: ['0vw', '-17vw', '-4vw'], y: ['0vh', '-10vh', '2vh'], scale: [1, .9, 1.08] }} transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute h-[19vw] w-[19vw] rounded-full bg-[#307b6c] blur-[2vw]" animate={ORB_POSITIONS[currentScene]} transition={{ duration: 1.25, ease: [0.16, 1, 0.3, 1] }} />
      <motion.div className="absolute h-[.18vw] bg-[#f5a524]" animate={LINE_POSITIONS[currentScene]} transition={{ duration: .85, ease: [0.16, 1, 0.3, 1] }} />
      <motion.div className="absolute right-[4vw] top-[5vh] z-20 flex items-center gap-[.7vw] opacity-75"><div className="h-[1.5vw] w-[1.5vw] overflow-hidden rounded-[.4vw]"><img className="h-full w-full" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" /></div><span className="video-mono text-[.62vw] font-bold">ASDAMKINDO</span></motion.div>
      <div className="relative z-10 h-full w-full">
        <AnimatePresence mode="sync" initial={false}>
          {currentScene === 0 && <Scene1 key="hook" />}
          {currentScene === 1 && <Scene2 key="evidence" />}
          {currentScene === 2 && <Scene3 key="talent" />}
          {currentScene === 3 && <Scene4 key="ecosystem" />}
          {currentScene === 4 && <Scene5 key="close" />}
        </AnimatePresence>
      </div>
      <div className="pointer-events-none absolute bottom-[3vh] right-[4vw] z-20 video-mono text-[.58vw] font-bold text-[#173743]/40">PBA / ASDAMKINDO / 16:9</div>
    </main>
  );
}