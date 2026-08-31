import { Link } from 'wouter';

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 group" data-testid="link-brand">
      <span className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl ${dark ? 'bg-primary' : 'bg-sidebar'}`} aria-hidden="true">
        <span className={`absolute h-px w-14 rotate-45 ${dark ? 'bg-sidebar' : 'bg-primary'}`} />
        <span className={`absolute h-px w-14 -rotate-45 ${dark ? 'bg-sidebar' : 'bg-primary'}`} />
        <span className={`relative font-mono text-[11px] font-bold ${dark ? 'text-sidebar' : 'text-primary'}`}>PBA</span>
      </span>
      <span className="leading-none">
        <span className={`block font-mono text-[10px] font-bold uppercase tracking-[.2em] ${dark ? 'text-primary' : 'text-accent'}`}>ASDAMKINDO</span>
        <span className={`mt-1 block text-[11px] font-semibold tracking-wide ${dark ? 'text-sidebar-foreground' : 'text-foreground'}`}>Pusat Bina Anggota</span>
      </span>
    </Link>
  );
}