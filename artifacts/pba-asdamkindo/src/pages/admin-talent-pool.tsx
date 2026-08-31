import { useState, useEffect } from 'react';
import {
  useGetAdminTalentPool,
  getGetAdminTalentPoolQueryKey,
  useGetAdminTalentConsentSettings,
  useUpdateAdminTalentConsentSettings,
  useOverrideAdminTalentConsent,
  GetAdminTalentPoolAvailability,
  GetAdminTalentPoolConsent,
  GetAdminTalentPoolExpiry,
  type GetAdminTalentPoolParams
} from '@workspace/api-client-react';
import { QueryState } from '@/components/ui-kit';
import { Search, ShieldCheck, ShieldAlert, Settings, MoreVertical, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { id as dateLocaleId } from 'date-fns/locale';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

export function AdminTalentPoolPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<GetAdminTalentPoolAvailability | ''>('');
  const [consent, setConsent] = useState<GetAdminTalentPoolConsent | ''>('');
  const [expiry, setExpiry] = useState<GetAdminTalentPoolExpiry>('all');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 400);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, availability, consent, expiry]);

  const params: GetAdminTalentPoolParams = { page };
  if (debouncedSearch) params.search = debouncedSearch;
  if (availability) params.availability = availability;
  if (consent) params.consent = consent;
  params.expiry = expiry;

  const { data: pageData, isLoading, isError, refetch } = useGetAdminTalentPool(params, {
    query: { queryKey: getGetAdminTalentPoolQueryKey(params) }
  });

  const overrideConsent = useOverrideAdminTalentConsent();

  const handleRevoke = (id: string) => {
    const note = prompt('Alasan pencabutan:');
    if (note === null) return;
    if (note.trim().length < 3) {
      alert('Alasan pencabutan minimal 3 karakter.');
      return;
    }

    overrideConsent.mutate({ id, data: { action: 'revoke', note } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminTalentPoolQueryKey(params) });
      },
      onError: () => alert('Pencabutan consent gagal. Muat ulang data lalu coba kembali.')
    });
  };

  const handleSetExpiry = (id: string) => {
    const rawDate = prompt('Atur tanggal kedaluwarsa baru (YYYY-MM-DD):');
    if (!rawDate) return;
    const parsedDate = new Date(`${rawDate}T23:59:59`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate <= new Date()) {
      alert('Tanggal kedaluwarsa harus valid dan berada di masa depan.');
      return;
    }
    const expiresAt = parsedDate.toISOString();
    const note = prompt('Catatan perubahan:') || 'Update by Admin';
    if (note.trim().length < 3) {
      alert('Catatan perubahan minimal 3 karakter.');
      return;
    }

    overrideConsent.mutate({ id, data: { action: 'set_expiry', expiresAt, note } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminTalentPoolQueryKey(params) });
      },
      onError: () => alert('Perubahan tanggal kedaluwarsa gagal. Muat ulang data lalu coba kembali.')
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12 space-y-10">
      <div className="flex flex-col lg:flex-row justify-between gap-6">
        <div>
          <p className="eyebrow text-accent">Pusat Data</p>
          <h1 className="display-font mt-3 text-4xl font-semibold">Manajemen Talent Pool</h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
            Pantau dan kelola persetujuan akses perusahaan ke profil anggota.
          </p>
        </div>
        <SettingsCard />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari anggota atau perusahaan..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <select
            value={availability}
            onChange={e => setAvailability(e.target.value as GetAdminTalentPoolAvailability | '')}
            className="w-full rounded-lg border border-border bg-card py-2.5 px-3 text-sm focus:border-primary focus:outline-none appearance-none"
          >
            <option value="">Semua Ketersediaan (Anggota)</option>
            <option value="available">Tersedia</option>
            <option value="open_to_offer">Terbuka (Pasif)</option>
            <option value="unavailable">Tidak Tersedia</option>
          </select>
        </div>
        <div>
          <select
            value={expiry}
            onChange={e => setExpiry(e.target.value as GetAdminTalentPoolExpiry)}
            className="w-full rounded-lg border border-border bg-card py-2.5 px-3 text-sm focus:border-primary focus:outline-none appearance-none"
          >
            <option value="all">Semua Masa Berlaku</option>
            <option value="next_30_days">Berakhir dalam 30 Hari</option>
            <option value="expired">Sudah Kedaluwarsa</option>
          </select>
        </div>
        <div>
          <select
            value={consent}
            onChange={e => setConsent(e.target.value as GetAdminTalentPoolConsent | '')}
            className="w-full rounded-lg border border-border bg-card py-2.5 px-3 text-sm focus:border-primary focus:outline-none appearance-none"
          >
            <option value="">Semua Status Persetujuan</option>
            <option value="active">Aktif</option>
            <option value="requested">Diminta</option>
            <option value="revoked">Dicabut</option>
            <option value="denied">Ditolak</option>
            <option value="expired">Kedaluwarsa</option>
          </select>
        </div>
      </div>

      <QueryState loading={isLoading} error={isError} retry={() => refetch()}>
        {pageData && (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Anggota</th>
                    <th className="px-5 py-4 font-semibold">Perusahaan</th>
                    <th className="px-5 py-4 font-semibold">Status Persetujuan</th>
                    <th className="px-5 py-4 font-semibold">Siklus Waktu</th>
                    <th className="px-5 py-4 font-semibold">Catatan / Versi</th>
                    <th className="px-5 py-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-muted-foreground">
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground mb-4">
                          <Search size={20} />
                        </div>
                        Tidak ada rekaman persetujuan yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    pageData.items.map(row => (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-bold">{row.memberName}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold">{row.companyName}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            row.status === 'active' ? 'bg-accent/10 text-accent' :
                            row.status === 'requested' ? 'bg-primary/10 text-primary' :
                            ['revoked', 'denied'].includes(row.status) ? 'bg-destructive/10 text-destructive' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {row.status === 'active' && <ShieldCheck size={12}/>}
                            {['revoked', 'denied'].includes(row.status) && <ShieldAlert size={12}/>}
                            {row.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-xs text-muted-foreground space-y-1">
                            {row.grantedAt && <p>Diberikan: {format(new Date(row.grantedAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                            {row.expiresAt && <p>Kedaluwarsa: {format(new Date(row.expiresAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                            {row.revokedAt && <p>Dicabut: {format(new Date(row.revokedAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-xs text-muted-foreground max-w-[200px] truncate" title={row.decisionNote || row.requestNote || '-'}>
                            <span className="font-mono bg-muted px-1 py-0.5 rounded mr-2">v{row.consentVersion}</span>
                            {row.decisionNote || row.requestNote || '-'}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {row.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handleSetExpiry(row.id)}
                                  disabled={overrideConsent.isPending}
                                  className="text-[11px] font-bold text-primary hover:underline"
                                >
                                  Ubah Kedaluwarsa
                                </button>
                                <button
                                  onClick={() => handleRevoke(row.id)}
                                  disabled={overrideConsent.isPending}
                                  className="text-[11px] font-bold text-destructive hover:underline ml-2"
                                >
                                  Cabut
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pageData.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-4 bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  Halaman {pageData.page} dari {pageData.totalPages} (Total {pageData.total} rekaman)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50"
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pageData.totalPages, p + 1))}
                    disabled={page === pageData.totalPages}
                    className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50"
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function SettingsCard() {
  const queryClient = useQueryClient();
  const { data: settings } = useGetAdminTalentConsentSettings({ query: { queryKey: ['admin-consent-settings'] } });
  const updateSettings = useUpdateAdminTalentConsentSettings();

  const [duration, setDuration] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (settings && !isEditing) {
      setDuration(settings.defaultDurationDays.toString());
    }
  }, [settings, isEditing]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseInt(duration, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      alert('Durasi harus antara 1 dan 365 hari.');
      return;
    }

    updateSettings.mutate({ data: { defaultDurationDays: days, note: 'Updated via Admin Portal' } }, {
      onSuccess: () => {
        setIsEditing(false);
        queryClient.invalidateQueries({ queryKey: ['admin-consent-settings'] });
      },
      onError: () => alert('Pengaturan durasi gagal disimpan. Coba kembali.')
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 lg:min-w-[300px] flex items-center justify-between lg:flex-col lg:items-start lg:justify-start gap-4">
      <div>
        <h2 className="text-sm font-bold flex items-center gap-2 mb-1">
          <Settings size={16} /> Pengaturan Durasi Izin
        </h2>
        <p className="text-xs text-muted-foreground">Durasi default akses Talent Pool per perusahaan.</p>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="365"
            required
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs font-bold mr-1">hari</span>
          <button
            type="submit"
            disabled={updateSettings.isPending}
            className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title="Simpan"
          >
            <Save size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted"
            title="Batal"
          >
            Batal
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-primary">{settings?.defaultDurationDays || '--'} hari</span>
          <button
            onClick={() => setIsEditing(true)}
            className="text-[11px] font-bold underline text-muted-foreground hover:text-foreground"
          >
            Ubah
          </button>
        </div>
      )}
    </div>
  );
}
