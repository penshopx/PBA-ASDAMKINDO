import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_DETAILS: Record<string, { title: string; filePath: string }> = {
  hook: { title: 'Dari pengalaman', filePath: 'src/components/video/video_scenes/Scene1.tsx' },
  evidence: { title: 'Menjadi bukti', filePath: 'src/components/video/video_scenes/Scene2.tsx' },
  talent: { title: 'Talenta relevan', filePath: 'src/components/video/video_scenes/Scene3.tsx' },
  ecosystem: { title: 'Ekosistem PBA', filePath: 'src/components/video/video_scenes/Scene4.tsx' },
  close: { title: 'Menuju kesempatan', filePath: 'src/components/video/video_scenes/Scene5.tsx' },
};

const PROGRESS_TICK_MS = 60;

function formatTime(durationMs: number) {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function PlaybackStatus({
  sceneKeys,
  activeIndex,
  activeDuration,
  activeStartTime,
  totalDuration,
  tick,
  paused,
  onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  activeStartTime: number;
  totalDuration: number;
  tick: number;
  paused: boolean;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedBaseRef = useRef(0);

  useEffect(() => {
    setElapsed(0);
    elapsedBaseRef.current = 0;
  }, [tick]);

  useEffect(() => {
    if (paused) return;
    const startedAt = performance.now();
    const timer = window.setInterval(
      () => setElapsed(elapsedBaseRef.current + performance.now() - startedAt),
      PROGRESS_TICK_MS,
    );
    return () => {
      window.clearInterval(timer);
      elapsedBaseRef.current += performance.now() - startedAt;
    };
  }, [paused, tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;
  const totalElapsed = Math.min(totalDuration, activeStartTime + Math.min(elapsed, activeDuration));

  return (
    <>
      <div className="flex flex-1 items-center gap-1.5">
        {sceneKeys.map((key, index) => (
          <button
            key={key}
            onClick={() => onJumpTo(index)}
            className="relative h-3 min-h-3 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/20 transition-all hover:h-4 hover:bg-white/25"
            aria-label={`Buka scene ${index + 1}: ${SCENE_DETAILS[key]?.title ?? key}`}
            aria-current={index === activeIndex ? 'true' : undefined}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-white/90 transition-[width] duration-100"
              style={{ width: `${index === activeIndex ? progress * 100 : 0}%` }}
            />
          </button>
        ))}
      </div>
      <span className="shrink-0 font-mono text-base text-white/65">
        {activeIndex + 1}/{sceneKeys.length}
      </span>
      <span className="min-w-[11ch] shrink-0 text-right font-mono text-base tabular-nums text-white/85">
        {formatTime(totalElapsed)} / {formatTime(totalDuration)}
      </span>
    </>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;
  const controls = useSceneControls(SCENE_DURATIONS);
  const sensorRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);

  useEffect(() => {
    if (!controls.paused) return;
    const frozen = document.getAnimations().filter((animation) => animation.playState === 'running');
    frozen.forEach((animation) => animation.pause());
    return () => frozen.forEach((animation) => animation.play());
  }, [controls.paused]);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const handleOutsideTap = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if (sensorRef.current && !sensorRef.current.contains(event.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', handleOutsideTap);
    return () => document.removeEventListener('pointerdown', handleOutsideTap);
  }, [collapsed, tapPinned]);

  const handleJumpTo = useCallback((index: number) => {
    controls.jumpTo(index);
    const key = controls.sceneKeys[index];
    const details = SCENE_DETAILS[key];
    if (!details?.filePath) return;
    window.parent.postMessage({
      type: 'REPLIT_VIDEO_SCENE_SELECTED',
      payload: {
        sceneIndex: index,
        sceneCount: controls.sceneKeys.length,
        sceneTitle: details.title,
        filePath: details.filePath,
        lineNumber: 1,
      },
    }, '*');
  }, [controls]);

  if (!isIframed) return <VideoTemplate />;

  const barVisible = !collapsed || hovering || tapPinned;
  const buttonClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white/65 transition-colors hover:bg-white/10 hover:text-white';

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <VideoTemplate
        key={controls.mountKey}
        durations={controls.durations}
        paused={controls.paused}
        muted={muted}
        onSceneChange={controls.onSceneChange}
      />
      <div
        ref={sensorRef}
        className="absolute inset-x-0 bottom-0 z-50 flex h-1/4 flex-col justify-end"
        onPointerEnter={(event) => event.pointerType === 'mouse' && setHovering(true)}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setHovering(false)}
        onPointerDown={(event) => event.pointerType !== 'mouse' && collapsed && setTapPinned(true)}
      >
        <div className="flex-1" aria-hidden="true" />
        <div className={`flex items-center gap-3 bg-[#173743]/88 px-5 py-3 backdrop-blur-md transition-all duration-200 ${barVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`}>
          <button className={buttonClass} onClick={controls.togglePause} aria-label={controls.paused ? 'Putar' : 'Jeda'}>
            {controls.paused ? <Play size={24} /> : <Pause size={24} />}
          </button>
          <button className={`${buttonClass} ${controls.locked ? 'bg-white/15 text-white' : ''}`} onClick={controls.toggleLock} aria-label="Ulangi scene aktif" aria-pressed={controls.locked}>
            <Repeat size={22} />
          </button>
          <button className={buttonClass} onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Aktifkan suara' : 'Matikan suara'}>
            {muted ? <VolumeX size={23} /> : <Volume2 size={23} />}
          </button>
          <div className="h-9 w-px bg-white/15" aria-hidden="true" />
          <PlaybackStatus
            sceneKeys={controls.sceneKeys}
            activeIndex={controls.activeIndex}
            activeDuration={controls.activeDuration}
            activeStartTime={controls.activeStartTime}
            totalDuration={controls.totalDuration}
            tick={controls.tick}
            paused={controls.paused}
            onJumpTo={handleJumpTo}
          />
          <button
            className={buttonClass}
            onClick={() => {
              setCollapsed((value) => !value);
              setHovering(false);
              setTapPinned(false);
            }}
            aria-label={collapsed ? 'Tampilkan kontrol' : 'Sembunyikan kontrol'}
          >
            {collapsed ? <ChevronUp size={27} /> : <ChevronDown size={27} />}
          </button>
        </div>
      </div>
    </div>
  );
}