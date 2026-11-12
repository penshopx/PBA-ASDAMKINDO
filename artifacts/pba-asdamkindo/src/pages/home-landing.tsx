import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  FileBadge2,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Link } from 'wouter';
import { Brand } from '@/components/brand';
import { ButtonLink } from '@/components/ui-kit';

const journeySteps = [
  {
    icon: UsersRound,
    title: 'Susun profil',
    text: 'Catat kompetensi, pengalaman, dan arah profesional Anda.',
  },
  {
    icon: BookOpen,
    title: 'Jelajahi program',
    text: 'Temukan pembelajaran yang tersedia untuk mendukung perjalanan Anda.',
  },
  {
    icon: FileBadge2,
    title: 'Rangkai Passport',
    text: 'Gunakan Professional Passport untuk menjelaskan pengalaman dan kompetensi.',
  },
  {
    icon: ShieldCheck,
    title: 'Atur visibilitas',
    text: 'Kelola tautan publik Passport dan persetujuan akses Talent Pool secara terpisah.',
  },
];

export function Home() {
  return (
    <main className="overflow-hidden bg-[#f1f7fc] text-[#15263a]">
      <div className="bg-[#0b1524] text-[#f4f8fc]">
        <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 px-5 py-4 sm:px-8 lg:px-10">
          <Brand dark />
          <nav className="hidden items-center gap-7 text-sm font-semibold md:flex" aria-label="Navigasi utama">
            <a href="#cara-kerja" className="text-white/75 transition hover:text-[#a9d9ff]" data-testid="link-how-it-works">Cara kerja</a>
            <Link href="/programs" className="text-white/75 transition hover:text-[#a9d9ff]" data-testid="link-public-programs">Program</Link>
            <a href="#untuk-siapa" className="text-white/75 transition hover:text-[#a9d9ff]" data-testid="link-for-who">Untuk siapa</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/sign-in" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-white/75 hover:text-white sm:inline-flex" data-testid="link-sign-in">Masuk</Link>
            <ButtonLink href="/sign-up" className="!bg-[#a9d9ff] !px-3 !py-2 !text-[#0b1524] hover:!bg-[#cce8ff] sm:!px-4" testId="link-sign-up">Buat akun</ButtonLink>
          </div>
        </header>

        <section className="relative isolate">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(169,217,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(169,217,255,.12)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:px-10 lg:py-24">
            <div className="max-w-2xl">
              <p className="eyebrow text-[#a9d9ff]">PBA ASDAMKINDO · Kompetensi konstruksi</p>
              <h1 className="display-font mt-6 text-[clamp(3rem,7vw,6.1rem)] font-semibold leading-[.96] tracking-[-.06em] text-[#f4f8fc]">
                Pengalaman kerja Anda. <span className="text-[#a9d9ff]">Terbaca dengan jelas.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#c3d0df] sm:text-lg sm:leading-8">
                Kompetensi sering tumbuh di lapangan, tetapi tidak selalu mudah diceritakan. PBA membantu Anda merangkai pengalaman, perjalanan belajar, dan Professional Passport dalam satu profil profesional.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/sign-up" className="!bg-[#a9d9ff] !text-[#0b1524] hover:!bg-[#cce8ff]" testId="link-hero-start">Bangun profil PBA</ButtonLink>
                <a href="#cara-kerja" className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10" data-testid="link-hero-how">Lihat cara kerja <ArrowDown size={16} aria-hidden="true" /></a>
              </div>
              <p className="mt-7 flex items-center gap-3 text-xs font-semibold text-[#b7c9dc]">
                <span className="h-px w-8 bg-[#a9d9ff]" />
                Profil dan visibilitas tetap dalam kendali Anda.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[540px] py-5">
              <div aria-hidden="true" className="absolute inset-4 rounded-full border border-[#a9d9ff]/15 sm:inset-8" />
              <div aria-hidden="true" className="absolute inset-12 rounded-full border border-[#a9d9ff]/10 sm:inset-16" />
              <div className="relative rounded-2xl border border-[#a9d9ff]/25 bg-[#13243a] p-4 shadow-[0_28px_80px_rgba(0,0,0,.32)] sm:p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <span className="eyebrow text-[.58rem] text-[#a9d9ff]">PBA / Professional Passport</span>
                  <span className="flex items-center gap-1.5 text-[.65rem] font-semibold text-[#c1d8eb]"><LockKeyhole size={13} /> Kendali privasi</span>
                </div>
                <div className="flex items-center gap-3 py-5">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#213b59] text-[#a9d9ff]"><UsersRound size={22} /></span>
                  <div>
                    <p className="eyebrow text-[.55rem] text-[#8eacc8]">Profil anggota</p>
                    <p className="mt-1 text-sm font-semibold text-[#f3f8fd]">Kompetensi, dalam konteks.</p>
                    <p className="mt-1 text-xs text-[#9aafc4]">Pengalaman · keahlian · bukti</p>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#0d1c2e] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="eyebrow text-[.55rem] text-[#8eacc8]">Perjalanan kompetensi</p>
                    <span className="text-[.65rem] text-[#9aafc4]">Dikelola oleh anggota</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {['Pengalaman', 'Kompetensi', 'Belajar', 'Passport'].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-[.65rem] text-[#d1dfec]">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#a9d9ff]" />{item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-lg bg-[#1b3048] p-3">
                  <span className="grid h-9 w-9 place-items-center border border-[#a9d9ff]/30 text-[#a9d9ff]"><FileBadge2 size={18} /></span>
                  <div>
                    <p className="text-xs font-semibold text-[#f3f8fd]">Professional Passport</p>
                    <p className="mt-1 text-[.65rem] leading-relaxed text-[#9aafc4]">Jejak profesional yang dapat dibagikan sesuai pilihan Anda.</p>
                  </div>
                  <ArrowRight className="ml-auto shrink-0 text-[#a9d9ff]" size={17} />
                </div>
              </div>
              <div className="absolute -bottom-1 right-0 flex items-center gap-2 rounded-lg border border-[#d0deea] bg-[#f5f9fd] px-3 py-2.5 text-[#17283b] shadow-xl sm:-right-4">
                <span className="grid h-8 w-8 place-items-center rounded bg-[#dceefd] text-[#1b629e]"><ShieldCheck size={17} /></span>
                <span><strong className="block text-[.68rem]">Anda yang mengatur</strong><small className="mt-0.5 block text-[.58rem] text-[#5c6e80]">Kontrol visibilitas profil</small></span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 md:grid-cols-[.8fr_1.2fr] lg:px-10 lg:py-24" aria-labelledby="problem-title">
        <div>
          <p className="eyebrow text-[#2878b8]">Tantangan di lapangan</p>
          <h2 id="problem-title" className="display-font mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Kerja nyata. <span className="text-[#367fb5]">Sulit terbaca?</span></h2>
        </div>
        <div className="pt-1 sm:pt-8">
          <p className="max-w-2xl text-base leading-7 text-[#52677c] sm:text-lg sm:leading-8">
            Pengalaman, keterampilan, dan pembelajaran bisa tersebar di banyak tempat. Saat semuanya tidak tersusun, perusahaan sulit memahami kompetensi yang Anda bawa—dan Anda pun sulit menunjukkan langkah berikutnya.
          </p>
          <p className="mt-6 flex max-w-xl items-start gap-3 border-t border-[#cbd9e6] pt-5 text-sm leading-6 text-[#294967]">
            <Layers3 className="mt-0.5 shrink-0 text-[#2d80c3]" size={18} />
            PBA bukan papan lowongan. Ini ruang untuk mengelola profil, perjalanan kompetensi, dan hubungan dengan kebutuhan perusahaan.
          </p>
        </div>
      </section>

      <section id="cara-kerja" className="scroll-mt-6 bg-[#e4f1fc]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow text-[#2878b8]">Cara kerja</p>
              <h2 className="display-font mt-4 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">Buat perjalanan kompetensi terlihat utuh.</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#52677c]">PBA membantu Anda menata profil, menemukan program, dan memilih bagaimana pengalaman profesional dibagikan.</p>
          </div>
          <div className="mt-10 grid border-y border-[#b7cddd] sm:grid-cols-2 lg:grid-cols-4">
            {journeySteps.map(({ icon: Icon, title, text }) => (
              <article key={title} className="border-b border-[#b7cddd] py-6 pr-5 last:border-b-0 sm:px-5 sm:first:pl-0 sm:[&:nth-child(n+3)]:border-b-0 lg:border-b-0 lg:border-l lg:first:border-l-0 lg:first:pl-0">
                <span className="grid h-10 w-10 place-items-center border border-[#aac6dc] bg-white/50 text-[#246da8]"><Icon size={19} /></span>
                <h3 className="display-font mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-[#536b80]">{text}</p>
              </article>
            ))}
          </div>
          <Link href="/programs" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#1a629e] hover:text-[#103b60]" data-testid="link-program-catalog">Jelajahi katalog program <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section id="untuk-siapa" className="scroll-mt-6 bg-[#101f35] text-[#f6faff]">
        <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 sm:px-8 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-24">
          <div>
            <p className="eyebrow text-[#a9d9ff]">Untuk anggota dan perusahaan</p>
            <h2 className="display-font mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Satu platform. Dua kebutuhan.</h2>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[#b5c7d9]">PBA menghubungkan perjalanan anggota dengan kebutuhan perusahaan, dengan persetujuan anggota sebagai bagian dari prosesnya.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="border border-white/15 bg-white/[.035] p-6">
              <span className="flex items-center justify-between text-[.62rem] font-bold tracking-[.12em] text-[#9cb1c7]"><UsersRound size={20} className="text-[#a9d9ff]" /> UNTUK ANGGOTA</span>
              <h3 className="display-font mt-8 text-2xl font-semibold">Tunjukkan lebih dari jabatan.</h3>
              <p className="mt-3 text-sm leading-6 text-[#b4c5d6]">Bangun profil kompetensi, susun perjalanan belajar, dan gunakan Professional Passport untuk menjelaskan pengalaman Anda.</p>
              <Link href="/sign-up" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#a9d9ff]" data-testid="link-member-cta">Mulai profil anggota <ArrowRight size={15} /></Link>
            </article>
            <article className="border border-white/15 bg-white/[.035] p-6">
              <span className="flex items-center justify-between text-[.62rem] font-bold tracking-[.12em] text-[#9cb1c7]"><BriefcaseBusiness size={20} className="text-[#a9d9ff]" /> UNTUK PERUSAHAAN</span>
              <h3 className="display-font mt-8 text-2xl font-semibold">Cari dengan konteks.</h3>
              <p className="mt-3 text-sm leading-6 text-[#b4c5d6]">Tinjau profil di Talent Pool yang dibagikan dengan persetujuan anggota, lalu kelola kebutuhan talenta perusahaan.</p>
              <Link href="/sign-up" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#a9d9ff]" data-testid="link-company-cta">Jelajahi PBA untuk perusahaan <ArrowRight size={15} /></Link>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[#d8eafb]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-14 sm:px-8 md:grid-cols-[1fr_auto] md:items-center lg:px-10 lg:py-20">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-1 shrink-0 text-[#246da8]" size={24} />
            <div>
              <h2 className="display-font text-3xl font-semibold sm:text-4xl">Profil Anda, pilihan Anda.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#4f6578]">Tautan publik Professional Passport dan akses Talent Pool perusahaan merupakan pengaturan terpisah. Anda dapat mengelola visibilitas dan persetujuan sesuai kebutuhan.</p>
            </div>
          </div>
          <Link href="/privacy" className="inline-flex items-center gap-2 text-sm font-bold text-[#1a629e] hover:underline" data-testid="link-privacy-information">Baca informasi privasi <ArrowUpRight size={16} /></Link>
        </div>
      </section>

      <section className="bg-[#0b1524] text-[#f4f8fc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow text-[#a9d9ff]">Mulai dari yang sudah Anda kerjakan</p>
            <h2 className="display-font mt-4 text-4xl font-semibold leading-tight sm:text-6xl">Rangkai pengalaman. <span className="text-[#a9d9ff]">Tentukan langkah berikutnya.</span></h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-[#b8c8d8]">Buat profil PBA atau telusuri program yang tersedia untuk melihat apakah platform ini sesuai dengan kebutuhan Anda.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/sign-up" className="!bg-[#a9d9ff] !text-[#0b1524] hover:!bg-[#cce8ff]" testId="link-final-sign-up">Buat akun PBA</ButtonLink>
            <ButtonLink href="/programs" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" testId="link-final-programs">Lihat program</ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#08111d] px-5 py-6 text-[#d8e4ef] sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Brand dark />
          <div className="flex flex-wrap gap-5 text-xs font-semibold text-[#a6b6c7]">
            <Link href="/privacy" data-testid="link-footer-privacy">Privasi</Link>
            <Link href="/terms" data-testid="link-footer-terms">Ketentuan</Link>
            <span>PBA ASDAMKINDO</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
