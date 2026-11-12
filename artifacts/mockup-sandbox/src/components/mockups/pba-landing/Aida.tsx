import "./_group.css";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Eye,
  FileBadge2,
  Layers3,
  LockKeyhole,
  Menu,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const ArrowLink = ({
  href,
  children,
  variant = "blue",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "blue" | "light" | "dark";
}) => (
  <a className={`aida-button aida-button--${variant}`} href={href}>
    <span>{children}</span>
    <ArrowUpRight size={16} strokeWidth={2.2} />
  </a>
);

function Mark() {
  return (
    <a className="aida-brand" href="#atas" aria-label="PBA ASDAMKINDO, kembali ke atas">
      <span className="aida-mark" aria-hidden="true">
        <i />
        <i />
        <b>PBA</b>
      </span>
      <span className="aida-brand-copy">
        <strong>ASDAMKINDO</strong>
        <small>Pusat Bina Anggota</small>
      </span>
    </a>
  );
}

function PassportSketch() {
  return (
    <div className="aida-passport" aria-label="Ilustrasi profil dan Professional Passport PBA">
      <div className="aida-passport-top">
        <span className="aida-mono">PBA / PROFESSIONAL PASSPORT</span>
        <span className="aida-lock"><LockKeyhole size={13} /> Kendali privasi</span>
      </div>
      <div className="aida-passport-main">
        <div className="aida-passport-identity">
          <div className="aida-avatar" aria-hidden="true"><UsersRound size={23} /></div>
          <div>
            <span className="aida-micro">PROFIL ANGGOTA</span>
            <strong>Kompetensi, dalam konteks.</strong>
            <span className="aida-subtle">Pengalaman · keahlian · bukti</span>
          </div>
          <span className="aida-edit">PROFIL</span>
        </div>
        <div className="aida-journey">
          <div className="aida-journey-head">
            <span className="aida-micro">PERJALANAN KOMPETENSI</span>
            <span className="aida-journey-label">Dirangkai oleh Anda</span>
          </div>
          <div className="aida-journey-line">
            <div className="aida-journey-step is-done"><span><Check size={13} /></span><b>Pengalaman</b></div>
            <div className="aida-journey-step"><span>02</span><b>Kompetensi</b></div>
            <div className="aida-journey-step"><span>03</span><b>Belajar</b></div>
            <div className="aida-journey-step"><span>04</span><b>Passport</b></div>
          </div>
        </div>
        <div className="aida-passport-bottom">
          <div className="aida-passport-seal"><FileBadge2 size={19} /></div>
          <div><strong>Professional Passport</strong><span>Jejak profesional yang dapat dibagikan sesuai pilihan Anda.</span></div>
          <ChevronRight size={18} className="aida-chevron" />
        </div>
      </div>
      <div className="aida-floating-note">
        <span className="aida-note-icon"><Eye size={17} /></span>
        <span><b>Anda yang mengatur</b><small>Kontrol atas visibilitas profil</small></span>
      </div>
    </div>
  );
}

export function Aida() {
  return (
    <main className="aida-page" id="atas">
      <style>{`
        .aida-page {
          --a-ink: #0b1524; --a-deep: #101f35; --a-blue: #a9d9ff; --a-blue-strong: #2376c8;
          --a-paper: #f2f7fb; --a-paper-blue: #e4f1fc; --a-text: #17283b; --a-muted: #52677c;
          --a-line: #cbd9e6; --a-white: #f6faff;
          background: var(--a-paper); color: var(--a-text); font-family: var(--app-font-sans, "DM Sans", sans-serif);
          overflow: hidden; min-height: 100dvh;
        }
        .aida-page * { box-sizing: border-box; }
        .aida-page a { text-decoration: none; }
        .aida-page a:focus-visible { outline: 3px solid #65b8ff; outline-offset: 4px; }
        .aida-wrap { width: min(1180px, calc(100% - 48px)); margin-inline: auto; }
        .aida-hero-shell { position: relative; background: var(--a-ink); color: var(--a-white); }
        .aida-hero-shell::before { content:""; position:absolute; inset:0; pointer-events:none; opacity:.16; background-image:linear-gradient(rgba(169,217,255,.12) 1px, transparent 1px),linear-gradient(90deg,rgba(169,217,255,.12) 1px,transparent 1px); background-size:48px 48px; mask-image:linear-gradient(90deg,transparent 0%,#000 52%,#000 100%); }
        .aida-header { position:relative; z-index:3; display:flex; align-items:center; justify-content:space-between; padding:24px 0; border-bottom:1px solid rgba(196,222,244,.15); }
        .aida-brand { display:flex; align-items:center; gap:12px; color:var(--a-white); }
        .aida-mark { position:relative; display:grid; width:42px; height:42px; place-items:center; overflow:hidden; border:1px solid rgba(169,217,255,.5); border-radius:12px; color:var(--a-blue); font:700 11px var(--app-font-mono,monospace); }
        .aida-mark i { position:absolute; width:58px; height:1px; background:var(--a-blue); transform:rotate(45deg); opacity:.8; }
        .aida-mark i:nth-child(2) { transform:rotate(-45deg); }
        .aida-mark b { position:relative; }
        .aida-brand-copy strong,.aida-brand-copy small { display:block; }
        .aida-brand-copy strong { color:var(--a-blue); font:700 10px var(--app-font-mono,monospace); letter-spacing:.18em; }
        .aida-brand-copy small { margin-top:4px; font-size:11px; font-weight:600; }
        .aida-nav { display:flex; align-items:center; gap:30px; }
        .aida-nav a,.aida-signin { color:rgba(246,250,255,.75); font-size:13px; font-weight:600; transition:color .2s ease; }
        .aida-nav a:hover,.aida-signin:hover { color:var(--a-blue); }
        .aida-header-actions { display:flex; align-items:center; gap:20px; }
        .aida-mobile-menu { display:none; color:var(--a-white); }
        .aida-button { min-height:48px; display:inline-flex; align-items:center; justify-content:center; gap:20px; border-radius:5px; padding:0 18px; font-size:13px; font-weight:700; transition:transform .2s ease,background .2s ease,color .2s ease; }
        .aida-button:hover { transform:translateY(-2px); }
        .aida-button--blue { color:#071526; background:var(--a-blue); }
        .aida-button--blue:hover { background:#d0eaff; }
        .aida-button--light { color:var(--a-ink); background:#f4f8fc; }
        .aida-button--light:hover { background:var(--a-blue); }
        .aida-button--dark { color:var(--a-white); border:1px solid rgba(246,250,255,.32); background:transparent; }
        .aida-button--dark:hover { background:rgba(246,250,255,.08); }
        .aida-hero { position:relative; z-index:1; display:grid; grid-template-columns:1.04fr .96fr; align-items:center; gap:56px; padding:98px 0 116px; }
        .aida-kicker,.aida-micro,.aida-mono { font-family:var(--app-font-mono,monospace); letter-spacing:.14em; text-transform:uppercase; }
        .aida-kicker { display:flex; align-items:center; gap:10px; color:var(--a-blue); font-size:10px; font-weight:700; }
        .aida-kicker::before { content:""; width:27px; height:1px; background:currentColor; }
        .aida-title { margin:24px 0 0; max-width:680px; color:var(--a-white); font:600 clamp(3.2rem,7vw,6.45rem)/.94 var(--app-font-serif, "Space Grotesk", sans-serif); letter-spacing:-.065em; }
        .aida-title span { color:var(--a-blue); }
        .aida-lead { max-width:520px; margin:25px 0 0; color:#c4d1df; font-size:17px; line-height:1.75; }
        .aida-hero-ctas { display:flex; flex-wrap:wrap; gap:12px; margin-top:31px; }
        .aida-hero-foot { display:flex; align-items:center; gap:12px; margin-top:34px; color:#aabbd0; font-size:11px; }
        .aida-foot-rule { width:34px; height:1px; background:#6ba9de; }
        .aida-visual { position:relative; min-height:454px; display:grid; align-items:center; }
        .aida-orbit { position:absolute; width:450px; height:450px; top:50%; left:50%; transform:translate(-45%,-50%); border:1px solid rgba(169,217,255,.15); border-radius:50%; }
        .aida-orbit::before,.aida-orbit::after { content:""; position:absolute; border:1px solid rgba(169,217,255,.1); border-radius:50%; inset:34px; }
        .aida-orbit::after { inset:75px; }
        .aida-passport { position:relative; z-index:1; width:min(100%,490px); margin:0 auto; border:1px solid rgba(169,217,255,.27); border-radius:13px; background:#13243a; box-shadow:0 24px 70px rgba(0,0,0,.28); }
        .aida-passport-top { display:flex; justify-content:space-between; align-items:center; padding:17px 19px; border-bottom:1px solid rgba(183,211,237,.15); color:#a9d9ff; }
        .aida-mono { font-size:8px; font-weight:700; }
        .aida-lock { display:flex; align-items:center; gap:6px; color:#c1d8eb; font-size:9px; }
        .aida-passport-main { padding:19px; }
        .aida-passport-identity { display:flex; align-items:center; gap:13px; padding:3px 0 20px; }
        .aida-avatar { display:grid; width:43px; height:43px; flex:none; place-items:center; border-radius:50%; color:#a9d9ff; background:#213b59; }
        .aida-passport-identity > div:nth-child(2) { display:grid; gap:5px; }
        .aida-micro { color:#8eacc8; font-size:8px; font-weight:700; }
        .aida-passport-identity strong { color:#f3f8fd; font-size:13px; font-weight:600; }
        .aida-subtle { color:#9aafc4; font-size:10px; }
        .aida-edit { margin-left:auto; align-self:flex-start; border:1px solid rgba(169,217,255,.3); border-radius:3px; padding:5px 7px; color:#a9d9ff; font:700 8px var(--app-font-mono,monospace); letter-spacing:.1em; }
        .aida-journey { padding:17px 15px 18px; border:1px solid rgba(183,211,237,.14); border-radius:7px; background:rgba(7,18,32,.32); }
        .aida-journey-head { display:flex; justify-content:space-between; gap:12px; }
        .aida-journey-label { color:#9aafc4; font-size:9px; }
        .aida-journey-line { display:flex; justify-content:space-between; position:relative; margin-top:19px; }
        .aida-journey-line::before { content:""; position:absolute; top:10px; left:10px; right:10px; height:1px; background:#38516a; }
        .aida-journey-step { position:relative; z-index:1; display:grid; justify-items:center; gap:8px; color:#a9bbce; font-size:9px; }
        .aida-journey-step > span { display:grid; width:21px; height:21px; place-items:center; border:1px solid #57738e; border-radius:50%; background:#13243a; font:700 8px var(--app-font-mono,monospace); }
        .aida-journey-step.is-done > span { border-color:#a9d9ff; color:#0b1524; background:#a9d9ff; }
        .aida-journey-step.is-done { color:#e7f3fc; }
        .aida-passport-bottom { display:flex; align-items:center; gap:12px; margin-top:14px; padding:14px 12px; border-radius:6px; background:#1b3048; }
        .aida-passport-seal { display:grid; width:34px; height:34px; place-items:center; border:1px solid rgba(169,217,255,.28); color:#a9d9ff; }
        .aida-passport-bottom div:nth-child(2) { display:grid; gap:4px; }
        .aida-passport-bottom strong { color:#f3f8fd; font-size:11px; }
        .aida-passport-bottom span { color:#9aafc4; font-size:9px; }
        .aida-chevron { margin-left:auto; color:#a9d9ff; }
        .aida-floating-note { position:absolute; z-index:2; right:-20px; bottom:13px; display:flex; align-items:center; gap:10px; padding:12px 14px; border:1px solid #d0deea; border-radius:6px; background:#f5f9fd; color:#17283b; box-shadow:0 12px 28px rgba(0,0,0,.2); }
        .aida-note-icon { display:grid; width:32px; height:32px; place-items:center; border-radius:4px; color:#1b629e; background:#dceefd; }
        .aida-floating-note b,.aida-floating-note small { display:block; }
        .aida-floating-note b { font-size:10px; }
        .aida-floating-note small { margin-top:3px; color:#5c6e80; font-size:9px; }
        .aida-scroll { position:absolute; bottom:22px; left:50%; display:flex; align-items:center; gap:9px; color:#91a7bd; font:700 8px var(--app-font-mono,monospace); letter-spacing:.15em; text-transform:uppercase; transform:translateX(-50%); }
        .aida-scroll svg { animation:aida-bob 1.8s ease-in-out infinite; }
        .aida-problem { position:relative; padding:102px 0 106px; background:var(--a-paper); }
        .aida-section-label { color:#2878b8; font:700 10px var(--app-font-mono,monospace); letter-spacing:.17em; text-transform:uppercase; }
        .aida-problem-grid { display:grid; grid-template-columns:.8fr 1.2fr; gap:80px; align-items:start; }
        .aida-problem h2,.aida-section-title { margin:16px 0 0; font:600 clamp(2.5rem,4.5vw,4.3rem)/1.02 var(--app-font-serif,"Space Grotesk",sans-serif); letter-spacing:-.055em; }
        .aida-problem h2 span { color:#367fb5; }
        .aida-problem-copy { padding-top:44px; }
        .aida-problem-copy p { max-width:565px; margin:0; color:var(--a-muted); font-size:17px; line-height:1.8; }
        .aida-problem-note { display:flex; align-items:flex-start; gap:13px; max-width:490px; margin-top:28px; padding-top:18px; border-top:1px solid var(--a-line); color:#294967; font-size:12px; line-height:1.65; }
        .aida-problem-note svg { flex:none; color:#2d80c3; }
        .aida-process { padding:100px 0 112px; background:var(--a-paper-blue); }
        .aida-process-head { display:flex; align-items:end; justify-content:space-between; gap:30px; }
        .aida-section-title { max-width:650px; }
        .aida-process-intro { max-width:350px; margin:0 0 5px; color:var(--a-muted); font-size:14px; line-height:1.75; }
        .aida-process-list { display:grid; grid-template-columns:repeat(4,1fr); margin-top:53px; border-top:1px solid #b7cddd; border-bottom:1px solid #b7cddd; }
        .aida-process-item { min-height:236px; padding:24px 23px 26px 0; position:relative; }
        .aida-process-item + .aida-process-item { padding-left:24px; border-left:1px solid #b7cddd; }
        .aida-process-num { color:#3280ba; font:700 10px var(--app-font-mono,monospace); letter-spacing:.12em; }
        .aida-process-icon { display:grid; width:42px; height:42px; margin-top:28px; place-items:center; border:1px solid #aac6dc; color:#246da8; background:rgba(255,255,255,.46); }
        .aida-process-item h3 { margin:16px 0 8px; font:600 20px var(--app-font-serif,"Space Grotesk",sans-serif); letter-spacing:-.035em; }
        .aida-process-item p { max-width:225px; margin:0; color:#536b80; font-size:12px; line-height:1.7; }
        .aida-program-link { display:inline-flex; align-items:center; gap:8px; margin-top:30px; color:#1a629e; font-size:12px; font-weight:700; }
        .aida-program-link:hover { color:#103b60; }
        .aida-audience { position:relative; padding:103px 0 110px; background:var(--a-deep); color:var(--a-white); }
        .aida-audience::after { content:"PBA"; position:absolute; right:-.04em; bottom:-.35em; color:rgba(169,217,255,.035); font:700 clamp(12rem,30vw,28rem)/1 var(--app-font-serif,"Space Grotesk",sans-serif); letter-spacing:-.1em; pointer-events:none; }
        .aida-audience-grid { position:relative; z-index:1; display:grid; grid-template-columns:.72fr 1.28fr; gap:65px; }
        .aida-audience .aida-section-title { color:#f6faff; }
        .aida-audience-intro { max-width:340px; margin:20px 0 0; color:#b5c7d9; font-size:14px; line-height:1.8; }
        .aida-audience-cards { display:grid; grid-template-columns:1fr 1fr; gap:15px; }
        .aida-audience-card { min-height:280px; padding:26px; border:1px solid rgba(177,210,239,.2); background:rgba(247,251,255,.035); }
        .aida-audience-card > svg { color:var(--a-blue); }
        .aida-card-index { float:right; color:#8198ae; font:700 9px var(--app-font-mono,monospace); }
        .aida-audience-card h3 { margin:44px 0 12px; color:#f5f9fd; font:600 22px var(--app-font-serif,"Space Grotesk",sans-serif); letter-spacing:-.04em; }
        .aida-audience-card p { min-height:76px; margin:0; color:#b4c5d6; font-size:12px; line-height:1.75; }
        .aida-audience-card a { display:inline-flex; align-items:center; gap:8px; margin-top:20px; color:#a9d9ff; font-size:11px; font-weight:700; }
        .aida-privacy { padding:84px 0; background:#d8eafb; }
        .aida-privacy-inner { display:grid; grid-template-columns:1fr auto; align-items:center; gap:42px; padding:34px 0; border-top:1px solid #aac8e0; border-bottom:1px solid #aac8e0; }
        .aida-privacy-title { display:flex; align-items:flex-start; gap:17px; }
        .aida-privacy-title svg { flex:none; margin-top:7px; color:#246da8; }
        .aida-privacy h2 { margin:0; font:600 clamp(1.8rem,3.2vw,2.8rem)/1.08 var(--app-font-serif,"Space Grotesk",sans-serif); letter-spacing:-.05em; }
        .aida-privacy p { max-width:590px; margin:13px 0 0; color:#4f6578; font-size:13px; line-height:1.7; }
        .aida-final { position:relative; padding:107px 0 102px; background:var(--a-ink); color:var(--a-white); overflow:hidden; }
        .aida-final::before { content:""; position:absolute; right:10%; top:-170px; width:430px; height:430px; border:1px solid rgba(169,217,255,.15); border-radius:50%; box-shadow:0 0 0 45px rgba(169,217,255,.025),0 0 0 90px rgba(169,217,255,.02); }
        .aida-final-inner { position:relative; z-index:1; display:flex; align-items:end; justify-content:space-between; gap:40px; }
        .aida-final h2 { max-width:750px; margin:17px 0 0; font:600 clamp(2.8rem,5.5vw,5.2rem)/.98 var(--app-font-serif,"Space Grotesk",sans-serif); letter-spacing:-.06em; }
        .aida-final h2 span { color:var(--a-blue); }
        .aida-final p { max-width:530px; margin:20px 0 0; color:#b8c8d8; font-size:14px; line-height:1.7; }
        .aida-final-actions { display:flex; flex:none; flex-direction:column; align-items:flex-start; gap:12px; }
        .aida-footer { padding:23px 0; background:#08111d; color:#a6b6c7; }
        .aida-footer-inner { display:flex; align-items:center; justify-content:space-between; gap:20px; }
        .aida-footer .aida-brand-copy small { color:#c9d5e1; }
        .aida-footer-meta { display:flex; gap:22px; align-items:center; font-size:10px; }
        .aida-footer-meta a:hover { color:var(--a-blue); }
        .aida-footer-meta span { color:#75879a; }
        @keyframes aida-bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(4px); } }
        @media (max-width:900px) {
          .aida-wrap { width:min(100% - 40px,700px); }
          .aida-nav { gap:18px; }
          .aida-hero { grid-template-columns:1fr; gap:38px; padding:76px 0 90px; }
          .aida-hero-copy { max-width:700px; }
          .aida-visual { min-height:420px; }
          .aida-orbit { width:410px; height:410px; }
          .aida-scroll { display:none; }
          .aida-problem-grid,.aida-audience-grid { grid-template-columns:1fr; gap:30px; }
          .aida-problem-copy { padding-top:0; }
          .aida-process-head { align-items:flex-start; flex-direction:column; }
          .aida-process-intro { max-width:560px; }
          .aida-process-list { grid-template-columns:repeat(2,1fr); }
          .aida-process-item:nth-child(3) { border-left:0; padding-left:0; }
          .aida-process-item:nth-child(n+3) { border-top:1px solid #b7cddd; }
          .aida-audience-cards { max-width:690px; }
          .aida-final-inner { align-items:flex-start; flex-direction:column; }
          .aida-final-actions { flex-direction:row; flex-wrap:wrap; }
        }
        @media (max-width:640px) {
          .aida-wrap { width:calc(100% - 36px); }
          .aida-header { padding:17px 0; }
          .aida-nav,.aida-signin { display:none; }
          .aida-header-actions { gap:0; }
          .aida-header-actions .aida-button { min-height:41px; padding:0 12px; font-size:11px; gap:9px; }
          .aida-mobile-menu { display:block; margin-left:12px; }
          .aida-hero { padding:64px 0 66px; gap:25px; }
          .aida-title { font-size:clamp(3.05rem,15vw,5rem); }
          .aida-lead { font-size:15px; line-height:1.7; }
          .aida-hero-foot { margin-top:25px; }
          .aida-hero-ctas .aida-button { flex:1; min-width:155px; }
          .aida-visual { min-height:330px; margin-inline:-4px; }
          .aida-orbit { width:320px; height:320px; }
          .aida-passport-top { padding:13px; }
          .aida-passport-main { padding:13px; }
          .aida-journey { padding:13px 10px; }
          .aida-journey-step { font-size:8px; }
          .aida-journey-label { font-size:8px; }
          .aida-floating-note { right:-3px; bottom:-8px; padding:9px 10px; }
          .aida-problem,.aida-process,.aida-audience { padding:72px 0; }
          .aida-problem-grid { gap:20px; }
          .aida-problem h2,.aida-section-title { font-size:clamp(2.35rem,11vw,3.4rem); }
          .aida-problem-copy p { font-size:15px; }
          .aida-process-list { margin-top:35px; }
          .aida-process-item { min-height:220px; padding:19px 13px 21px 0; }
          .aida-process-item + .aida-process-item { padding-left:13px; }
          .aida-process-item:nth-child(3) { padding-left:0; }
          .aida-process-item h3 { font-size:18px; }
          .aida-process-item p { font-size:11px; }
          .aida-process-icon { margin-top:22px; }
          .aida-audience-cards { grid-template-columns:1fr; }
          .aida-audience-card { min-height:0; }
          .aida-audience-card h3 { margin-top:28px; }
          .aida-audience-card p { min-height:0; }
          .aida-privacy { padding:54px 0; }
          .aida-privacy-inner { grid-template-columns:1fr; gap:25px; padding:26px 0; }
          .aida-privacy-inner > .aida-button { width:100%; }
          .aida-final { padding:75px 0; }
          .aida-final-inner { gap:27px; }
          .aida-final-actions { flex-direction:column; width:100%; }
          .aida-final-actions .aida-button { width:100%; }
          .aida-footer-inner { align-items:flex-start; flex-direction:column; }
          .aida-footer-meta { flex-wrap:wrap; gap:12px 18px; }
        }
        @media (prefers-reduced-motion:reduce) {
          .aida-page *, .aida-page *::before, .aida-page *::after { scroll-behavior:auto !important; animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
        }
      `}</style>
      <div className="aida-hero-shell">
        <header className="aida-header aida-wrap">
          <Mark />
          <nav className="aida-nav" aria-label="Navigasi utama">
            <a href="#cara-kerja">Cara kerja</a>
            <a href="/programs">Program</a>
            <a href="#untuk-siapa">Untuk siapa</a>
          </nav>
          <div className="aida-header-actions">
            <a className="aida-signin" href="/sign-up">Daftar</a>
            <ArrowLink href="/sign-up" variant="blue">Mulai di PBA</ArrowLink>
            <a className="aida-mobile-menu" href="#cara-kerja" aria-label="Lihat cara kerja"><Menu size={20} /></a>
          </div>
        </header>

        <section className="aida-hero aida-wrap" aria-labelledby="aida-title">
          <div className="aida-hero-copy">
            <div className="aida-kicker">PBA ASDAMKINDO · Kompetensi konstruksi</div>
            <h1 className="aida-title" id="aida-title">Pengalaman kerja Anda.<br /><span>Terbaca dengan jelas.</span></h1>
            <p className="aida-lead">Kompetensi sering tumbuh di lapangan, tetapi tidak selalu mudah diceritakan. PBA membantu Anda merangkai pengalaman, perjalanan belajar, dan Professional Passport dalam satu profil profesional.</p>
            <div className="aida-hero-ctas">
              <ArrowLink href="/sign-up" variant="blue">Bangun profil PBA</ArrowLink>
              <ArrowLink href="#cara-kerja" variant="dark">Lihat cara kerja</ArrowLink>
            </div>
            <div className="aida-hero-foot"><span className="aida-foot-rule" />Profil dan visibilitas tetap dalam kendali Anda.</div>
          </div>
          <div className="aida-visual">
            <div className="aida-orbit" aria-hidden="true" />
            <PassportSketch />
          </div>
          <a className="aida-scroll" href="#permasalahan">Lanjutkan <ArrowDown size={13} /></a>
        </section>
      </div>

      <section className="aida-problem" id="permasalahan">
        <div className="aida-wrap aida-problem-grid">
          <div>
            <div className="aida-section-label">A · Attention</div>
            <h2>Kerja nyata.<br /><span>Sulit terbaca?</span></h2>
          </div>
          <div className="aida-problem-copy">
            <p>Pengalaman, keterampilan, dan pembelajaran bisa tersebar di banyak tempat. Saat semuanya tidak tersusun, perusahaan sulit memahami kompetensi yang Anda bawa—dan Anda pun sulit menunjukkan langkah berikutnya.</p>
            <div className="aida-problem-note"><Layers3 size={18} /><span>PBA bukan papan lowongan. Ini ruang untuk menjadikan kompetensi dan perjalanan profesional anggota lebih legible.</span></div>
          </div>
        </div>
      </section>

      <section className="aida-process" id="cara-kerja">
        <div className="aida-wrap">
          <div className="aida-process-head">
            <div>
              <div className="aida-section-label">I · Interest</div>
              <h2 className="aida-section-title">Buat perjalanan kompetensi Anda terlihat utuh.</h2>
            </div>
            <p className="aida-process-intro">PBA menyatukan beberapa langkah praktis—dari menata profil, memilih pembelajaran, hingga menentukan apa yang ingin dibagikan.</p>
          </div>
          <div className="aida-process-list">
            <article className="aida-process-item">
              <span className="aida-process-num">LANGKAH 01</span>
              <span className="aida-process-icon"><UsersRound size={20} /></span>
              <h3>Susun profil</h3>
              <p>Catat kompetensi dan pengalaman kerja dalam profil profesional Anda.</p>
            </article>
            <article className="aida-process-item">
              <span className="aida-process-num">LANGKAH 02</span>
              <span className="aida-process-icon"><BookOpen size={20} /></span>
              <h3>Pilih pembelajaran</h3>
              <p>Jelajahi katalog program untuk mendukung perjalanan kompetensi.</p>
            </article>
            <article className="aida-process-item">
              <span className="aida-process-num">LANGKAH 03</span>
              <span className="aida-process-icon"><FileBadge2 size={20} /></span>
              <h3>Rangkai Passport</h3>
              <p>Gunakan Professional Passport sebagai rangkuman perjalanan profesional.</p>
            </article>
            <article className="aida-process-item">
              <span className="aida-process-num">LANGKAH 04</span>
              <span className="aida-process-icon"><ShieldCheck size={20} /></span>
              <h3>Atur visibilitas</h3>
              <p>Tentukan kendali privasi profil saat berinteraksi dengan Talent Pool.</p>
            </article>
          </div>
          <a className="aida-program-link" href="/programs">Jelajahi katalog program <ArrowRight size={15} /></a>
        </div>
      </section>

      <section className="aida-audience" id="untuk-siapa">
        <div className="aida-wrap aida-audience-grid">
          <div>
            <div className="aida-section-label">D · Desire</div>
            <h2 className="aida-section-title">Satu platform.<br />Dua kebutuhan.</h2>
            <p className="aida-audience-intro">PBA menghubungkan perjalanan anggota dengan kebutuhan perusahaan—dengan persetujuan anggota sebagai bagian dari prosesnya.</p>
          </div>
          <div className="aida-audience-cards">
            <article className="aida-audience-card">
              <span className="aida-card-index">UNTUK ANGGOTA</span>
              <UsersRound size={22} />
              <h3>Tunjukkan lebih dari jabatan.</h3>
              <p>Bangun profil kompetensi, susun perjalanan belajar, dan gunakan Professional Passport untuk menjelaskan pengalaman Anda.</p>
              <a href="/sign-up">Mulai profil anggota <ArrowRight size={15} /></a>
            </article>
            <article className="aida-audience-card">
              <span className="aida-card-index">UNTUK PERUSAHAAN</span>
              <Layers3 size={22} />
              <h3>Cari dengan konteks.</h3>
              <p>Tinjau profil di Talent Pool yang dibagikan dengan persetujuan anggota, lalu publikasikan kebutuhan talenta perusahaan.</p>
              <a href="/sign-up">Jelajahi PBA untuk perusahaan <ArrowRight size={15} /></a>
            </article>
          </div>
        </div>
      </section>

      <section className="aida-privacy">
        <div className="aida-wrap aida-privacy-inner">
          <div>
            <div className="aida-privacy-title"><ShieldCheck size={23} /><h2>Profil Anda, pilihan Anda.</h2></div>
            <p>Talent Pool memberi perusahaan ruang untuk meninjau profil anggota yang telah memberikan persetujuan. Anggota tetap memiliki kontrol atas visibilitas informasinya.</p>
          </div>
          <a className="aida-button aida-button--light" href="/sign-up"><span>Pelajari lewat akun PBA</span><ArrowUpRight size={16} /></a>
        </div>
      </section>

      <section className="aida-final" id="mulai">
        <div className="aida-wrap aida-final-inner">
          <div>
            <div className="aida-section-label">A · Action</div>
            <h2>Mulai dari yang sudah Anda <span>kerjakan.</span></h2>
            <p>Buat profil PBA, telusuri program yang tersedia, dan rapikan cara Anda memperkenalkan kompetensi di dunia konstruksi.</p>
          </div>
          <div className="aida-final-actions">
            <ArrowLink href="/sign-up" variant="blue">Buat akun PBA</ArrowLink>
            <ArrowLink href="/programs" variant="dark">Lihat katalog program</ArrowLink>
          </div>
        </div>
      </section>

      <footer className="aida-footer">
        <div className="aida-wrap aida-footer-inner">
          <Mark />
          <div className="aida-footer-meta">
            <a href="#cara-kerja">Cara kerja</a>
            <a href="/programs">Program PBA</a>
            <a href="#untuk-siapa">Untuk siapa</a>
            <span>PBA ASDAMKINDO</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default Aida;
