import { Bell, CheckCheck, ChevronRight, FileCheck2, GraduationCap, Megaphone, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListNotificationsQueryKey, useListNotifications, useMarkNotificationRead } from '@workspace/api-client-react';
import type { Notification } from '@workspace/api-client-react';
import { QueryState } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

const iconMap: Record<string, React.ElementType> = { profile: UserRound, document: FileCheck2, program: GraduationCap, learning: GraduationCap, recruitment: UsersRound, system: Megaphone, consent: ShieldCheck };
export function Notifications() {
  const query = useListNotifications({ query: { queryKey: ['/api/notifications'] } });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const list = useMemo(() => (query.data ?? []).filter(item => filter === 'all' || !item.read), [query.data, filter]);
  const markRead = useMarkNotificationRead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
      onError: () => toast({ variant: 'destructive', title: 'Pengingat belum selesai', description: 'Periksa koneksi lalu coba lagi.' }),
    },
  });
  const unread = query.data?.filter(item => !item.read) ?? [];
  const markAllRead = async () => {
    if (unread.length === 0) return;
    try {
      await Promise.all(unread.map(item => markRead.mutateAsync({ id: item.id })));
      toast({ title: 'Semua pengingat selesai', description: 'Perubahan tercatat di audit log.' });
    } catch {
      // The mutation toast explains the failed request.
    }
  };
  return <div className="mx-auto max-w-4xl px-5 py-9 sm:px-8 lg:py-12"><div className="flex flex-col justify-between gap-5 border-b border-border pb-8 sm:flex-row sm:items-end"><div><p className="eyebrow text-accent">Pusat aktivitas</p><h1 className="display-font mt-3 text-4xl font-semibold sm:text-5xl">Notifikasi</h1><p className="mt-3 text-sm text-muted-foreground">Hal penting tentang profil, program, dan peluang Anda.</p></div><button onClick={markAllRead} disabled={markRead.isPending || unread.length === 0} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-primary disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto" data-testid="button-mark-all-read"><CheckCheck size={15} /> Tandai semua selesai</button></div><div className="mt-6 flex items-center justify-between"><div className="flex gap-1 rounded-lg bg-muted p-1"><button onClick={() => setFilter('all')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${filter === 'all' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} data-testid="button-filter-all">Semua</button><button onClick={() => setFilter('unread')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${filter === 'unread' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} data-testid="button-filter-unread">Belum dibaca</button></div><span className="text-xs font-semibold text-muted-foreground">{list.length} aktivitas</span></div><div className="mt-5"><QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()} empty={!query.isLoading && !query.isError && list.length === 0} emptyTitle={filter === 'unread' ? 'Semua sudah dibaca' : 'Belum ada notifikasi'}><div className="space-y-2">{list.map(note => <NotificationRow key={note.id} note={note} onRead={() => markRead.mutate({ id: note.id })} pending={markRead.isPending} />)}</div></QueryState></div></div>;
}
function NotificationRow({ note, onRead, pending }: { note: Notification; onRead: () => void; pending: boolean }) {
  const Icon = iconMap[note.type] ?? Bell;
  return <div className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left sm:p-5 ${note.read ? 'border-border bg-card' : 'border-primary/30 bg-primary/5'}`} data-testid={`button-notification-${note.id}`}><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${note.read ? 'bg-muted text-muted-foreground' : 'bg-primary/20 text-accent'}`}><Icon size={19} /></div><div className="min-w-0 flex-1"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><strong className="truncate text-sm">{note.title}</strong>{!note.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}</div><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{note.description}</p><p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{new Date(note.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>{!note.read ? <button onClick={onRead} disabled={pending} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-[11px] font-bold hover:border-primary disabled:opacity-50" data-testid={`button-complete-notification-${note.id}`}><CheckCheck size={13} /> Selesai</button> : <ChevronRight className="mt-1 shrink-0 text-muted-foreground" size={18} />}</div></div></div>;
}