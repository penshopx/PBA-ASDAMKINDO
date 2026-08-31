import { ArrowUpRight, Check, ChevronRight, CircleAlert, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import type { ReactNode } from 'react';
import type { ActionItem, Metric } from '@workspace/api-client-react';

export function ButtonLink({ href, children, variant = 'primary', className = '', testId }: { href: string; children: ReactNode; variant?: 'primary' | 'ghost' | 'outline'; className?: string; testId?: string }) {
  const styles = variant === 'primary' ? 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md' : variant === 'outline' ? 'border border-border bg-card text-foreground hover:border-primary hover:text-accent' : 'text-foreground hover:bg-muted';
  return <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${styles} ${className}`} data-testid={testId ?? `link-${href.replaceAll('/', '-').replaceAll(':', '')}`}><span>{children}</span><ArrowUpRight size={16} strokeWidth={2.2} /></Link>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} data-testid="loading-skeleton" />;
}

export function QueryState({ loading, error, retry, children, empty = false, emptyTitle = 'Belum ada data' }: { loading?: boolean; error?: boolean; retry?: () => void; children: ReactNode; empty?: boolean; emptyTitle?: string }) {
  if (loading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div></div>;
  if (error) return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center" data-testid="state-error"><CircleAlert className="mx-auto mb-3 text-destructive" size={28} /><h3 className="font-bold">Data belum dapat dimuat</h3><p className="mt-1 text-sm text-muted-foreground">Periksa koneksi lalu coba lagi.</p>{retry && <button onClick={retry} className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background" data-testid="button-retry">Coba lagi</button>}</div>;
  if (empty) return <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center" data-testid="state-empty"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted text-accent"><Check size={20} /></div><h3 className="font-bold">{emptyTitle}</h3><p className="mt-1 text-sm text-muted-foreground">Kami akan menampilkan pembaruan di sini.</p></div>;
  return <>{children}</>;
}

export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric, i) => <div key={`${metric.label}-${i}`} className="bg-card p-5" data-testid={`metric-${i}`}><p className="text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">{metric.label}</p><div className="mt-3 flex items-end justify-between gap-2"><strong className="display-font text-3xl font-semibold">{metric.value}</strong>{metric.change && <span className={`mb-1 text-xs font-bold ${metric.tone === 'positive' ? 'text-accent' : metric.tone === 'warning' || metric.tone === 'attention' ? 'text-destructive' : 'text-muted-foreground'}`}>{metric.change}</span>}</div></div>)}</div>;
}

export function ActionCard({ action }: { action: ActionItem }) {
  return <Link href={action.href} className="group flex items-center justify-between gap-5 rounded-2xl border border-border bg-card p-5 hover:-translate-y-0.5 hover:border-primary hover:shadow-sm" data-testid={`link-action-${action.href.replaceAll('/', '-')}`}><span><span className="eyebrow text-accent">{action.tone === 'warning' ? 'Perlu perhatian' : 'Langkah berikutnya'}</span><strong className="mt-2 block text-base">{action.title}</strong><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{action.description}</span></span><ChevronRight className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" size={21} /></Link>;
}

export function LoadingButton({ loading, children }: { loading: boolean; children: ReactNode }) {
  return <button disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm disabled:opacity-60" type="submit" data-testid="button-submit">{loading && <Loader2 size={16} className="animate-spin" />}{children}</button>;
}