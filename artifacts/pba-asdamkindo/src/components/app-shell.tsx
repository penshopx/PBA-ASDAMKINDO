import { Bell, BookOpen, ChevronDown, ClipboardCheck, Compass, House, LogOut, Menu, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import { useGetCurrentUser } from '@workspace/api-client-react';
import { Brand } from '@/components/brand';
import { Skeleton } from '@/components/ui-kit';

const memberNav = [
  { href: '/member/dashboard', label: 'Ringkasan', icon: House },
  { href: '/programs', label: 'Program belajar', icon: BookOpen },
  { href: '/member/journey', label: 'Perjalanan kompetensi', icon: Sparkles },
  { href: '/notifications', label: 'Notifikasi', icon: Bell },
];
const companyNav = [
  { href: '/company/dashboard', label: 'Ringkasan', icon: House },
  { href: '/programs', label: 'Program belajar', icon: BookOpen },
  { href: '/notifications', label: 'Notifikasi', icon: Bell },
];
const adminNav = [
  { href: '/admin/dashboard', label: 'Ringkasan operasi', icon: House },
  { href: '/admin/operations', label: 'Pusat operasi', icon: ClipboardCheck },
  { href: '/programs', label: 'Program belajar', icon: BookOpen },
  { href: '/notifications', label: 'Notifikasi', icon: Bell },
];

export function Protected({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useGetCurrentUser({ query: { queryKey: ['/api/me'] } });
  const [location, setLocation] = useLocation();
  if (isLoading) return <div className="grid min-h-[100dvh] place-items-center bg-background p-6"><div className="w-full max-w-sm space-y-3"><Skeleton className="mx-auto h-10 w-10 rounded-xl" /><Skeleton className="h-5 w-2/3 mx-auto" /><Skeleton className="h-3 w-1/2 mx-auto" /></div></div>;
  if (!user) { setLocation('/sign-in'); return null; }
  if (!user.onboardingComplete && !location.startsWith('/onboarding/')) {
    setLocation(user.role === 'company' ? '/onboarding/company' : '/onboarding/member');
    return null;
  }
  return <>{children}</>;
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useGetCurrentUser({ query: { queryKey: ['/api/me'] } });
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!isLoading && user && user.role !== 'admin' && user.role !== 'super_admin') setLocation('/403');
  }, [isLoading, user, setLocation]);
  if (isLoading) return <div className="grid min-h-[100dvh] place-items-center bg-background p-6"><Skeleton className="h-16 w-16 rounded-2xl" /></div>;
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return null;
  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { data: user } = useGetCurrentUser({ query: { queryKey: ['/api/me'] } });
  const { signOut } = useClerk();
  const nav = user?.role === 'company' ? companyNav : user?.role === 'admin' || user?.role === 'super_admin' ? adminNav : memberNav;
  const displayName = user?.name || 'Akun PBA';
  return <div className="min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2"><Brand dark /><button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden" onClick={() => setOpen(false)} data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="mt-10 px-2"><p className="eyebrow text-sidebar-foreground/45">Workspace</p><nav className="mt-3 space-y-1">{nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${location === href ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.replaceAll(' ', '-')}`}><Icon size={18} /><span>{label}</span>{label === 'Notifikasi' && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-sidebar-primary px-1 text-[10px] font-bold text-sidebar-primary-foreground">3</span>}</Link>)}</nav></div>
      <div className="mt-8 px-2"><p className="eyebrow text-sidebar-foreground/45">Akses cepat</p><div className="mt-3 space-y-1"><Link href="/programs" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="link-quick-programs"><Compass size={18} /> Jelajahi program</Link><Link href="/notifications" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="link-quick-notifications"><ClipboardCheck size={18} /> Pusat aktivitas</Link></div></div>
      <div className="mt-auto rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-4"><p className="text-xs font-semibold text-sidebar-foreground/55">Butuh dukungan?</p><p className="mt-1 text-sm font-semibold">Tim PBA siap membantu.</p><button className="mt-3 text-xs font-bold text-sidebar-primary hover:underline" data-testid="button-contact-support" onClick={() => window.alert('Tim PBA akan segera menghubungi Anda.')}>Hubungi tim →</button></div>
      <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border px-2 pt-4"><div className="grid h-9 w-9 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{displayName.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{displayName}</p><p className="truncate text-xs text-sidebar-foreground/50">{user?.organization || (user?.role === 'company' ? 'Perusahaan' : 'Anggota')}</p></div><button onClick={() => signOut({ redirectUrl: '/' })} className="rounded-md p-2 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-primary" title="Keluar" data-testid="button-logout"><LogOut size={16} /></button></div>
    </aside>
    {open && <button className="fixed inset-0 z-30 bg-sidebar/45 lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu" data-testid="button-overlay-menu" />}
    <main className="lg:pl-[264px]"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md sm:px-8"><button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-muted lg:hidden" data-testid="button-open-menu"><Menu size={20} /></button><div className="hidden items-center gap-3 text-sm text-muted-foreground sm:flex"><Search size={17} /><span>Ruang kerja PBA</span></div><div className="ml-auto flex items-center gap-2"><Link href="/notifications" className="relative rounded-lg p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-header-notifications"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" /></Link><Link href={user?.role === 'company' ? '/company/dashboard' : user?.role === 'admin' || user?.role === 'super_admin' ? '/admin/dashboard' : '/member/dashboard'} className="flex items-center gap-2 rounded-lg py-1.5 pl-2 pr-1.5 hover:bg-muted" data-testid="link-header-profile"><span className="hidden text-right sm:block"><span className="block text-xs font-bold">{displayName}</span><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{user?.role === 'company' ? 'Company' : user?.role === 'admin' || user?.role === 'super_admin' ? 'Operations' : 'Member'}</span></span><span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{displayName.slice(0, 1).toUpperCase()}</span><ChevronDown size={14} className="text-muted-foreground" /></Link></div></header><div className="page-enter">{children}</div></main>
  </div>;
}