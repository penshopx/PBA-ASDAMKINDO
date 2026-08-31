import { useState, useEffect } from 'react';
import {
  useGetCompanyTalentPool,
  getGetCompanyTalentPoolQueryKey,
  useListCompanyConsentRequests,
  getListCompanyConsentRequestsQueryKey,
  useRequestCompanyTalentConsent,
  GetCompanyTalentPoolAvailability,
  type GetCompanyTalentPoolParams,
  type ListCompanyConsentRequestsStatus
} from '@workspace/api-client-react';
import { QueryState } from '@/components/ui-kit';
import { Search, MapPin, Briefcase, UserCircle, CheckCircle2, LayoutGrid, List, Plus, Clock, FileText } from 'lucide-react';
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

export function CompanyTalentPoolPage() {
  const [activeTab, setActiveTab] = useState<'candidates' | 'requests'>('candidates');
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<GetCompanyTalentPoolAvailability | ''>('');
  const [location, setLocation] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 400);
  const debouncedLocation = useDebounce(location, 400);
  useEffect(() => { setPage(1); }, [debouncedSearch, availability, debouncedLocation]);

  const params: GetCompanyTalentPoolParams = { page };
  if (debouncedSearch) params.search = debouncedSearch;
  if (availability) params.availability = availability;
  if (debouncedLocation) params.location = debouncedLocation;

  const { data: candidatesPage, isLoading, isError, refetch } = useGetCompanyTalentPool(params, {
    query: { queryKey: getGetCompanyTalentPoolQueryKey(params) }
  });

  return (
    <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="eyebrow text-accent">Pencarian Kandidat</p>
        <h1 className="display-font mt-3 text-4xl font-semibold">Talent Pool</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
           Jelajahi profesional yang telah memberikan akses kepada perusahaan Anda. Ajukan permintaan akses jika Anda mengetahui tautan paspor mereka.
        </p>
      </div>

      <div className="flex gap-4 border-b border-border mb-8">
        <button
          onClick={() => setActiveTab('candidates')}
          className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'candidates' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Kandidat Aktif
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'requests' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Permintaan Akses
        </button>
      </div>

      {activeTab === 'candidates' && (
        <>
          <div className="mb-8 flex flex-col md:flex-row gap-4">
            <div className="flex-1 grid gap-4 md:grid-cols-3">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Cari keahlian atau jabatan..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="relative">
                <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Lokasi domisili..."
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <select
                  value={availability}
                onChange={e => setAvailability(e.target.value as GetCompanyTalentPoolAvailability | '')}
                  className="w-full rounded-lg border border-border bg-card py-2.5 px-3 text-sm focus:border-primary focus:outline-none appearance-none"
                >
                  <option value="">Semua Ketersediaan</option>
                  <option value="available">Tersedia Saat Ini</option>
                  <option value="open_to_offer">Terbuka untuk Tawaran</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`rounded-md p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                title="List View"
              >
                <List size={18} />
              </button>
            </div>
          </div>

          <QueryState loading={isLoading} error={isError} retry={() => refetch()}>
            {candidatesPage && (
              candidatesPage.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Search size={24} />
                  </div>
                  <h3 className="mt-4 text-lg font-bold">Kandidat tidak ditemukan</h3>
                  <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                    Anda belum memiliki akses ke kandidat yang cocok dengan pencarian Anda. Ajukan permintaan akses ke kandidat spesifik menggunakan tautan paspor mereka.
                  </p>
                </div>
              ) : (
                <div className={viewMode === 'grid' ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
                  {candidatesPage.items.map(candidate => (
                    <div key={candidate.id} className={`rounded-2xl border border-border bg-card p-6 hover:border-primary/50 transition-colors shadow-sm ${viewMode === 'list' ? 'flex flex-col md:flex-row md:items-center gap-6' : ''}`}>
                      <div className={`flex items-start gap-4 ${viewMode === 'list' ? 'md:w-[40%]' : ''}`}>
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sidebar/5 text-sidebar">
                          <UserCircle size={28} />
                        </div>
                        <div>
                          <h3 className="font-bold flex items-center gap-1.5">
                            {candidate.name}
                            <CheckCircle2 size={14} className="text-accent" />
                          </h3>
                          <p className="text-sm font-medium text-primary mt-0.5 line-clamp-2">{candidate.headline}</p>
                        </div>
                      </div>

                      <div className={`mt-5 space-y-3 ${viewMode === 'list' ? 'mt-0 md:w-[35%] space-y-2' : ''}`}>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Briefcase size={16} className="shrink-0" />
                          <span className="truncate">{candidate.expertise} ({candidate.experienceYears} thn)</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin size={16} className="shrink-0" />
                          <span className="truncate">{candidate.domicile}</span>
                        </div>
                      </div>

                      <div className={`mt-6 pt-5 border-t border-border flex items-center justify-between ${viewMode === 'list' ? 'mt-0 pt-0 border-t-0 md:w-[25%] justify-end gap-6' : ''}`}>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                          candidate.availabilityStatus === 'available' ? 'bg-primary/10 text-primary' :
                          candidate.availabilityStatus === 'open_to_offer' ? 'bg-accent/10 text-accent' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            candidate.availabilityStatus === 'available' ? 'bg-primary' :
                            candidate.availabilityStatus === 'open_to_offer' ? 'bg-accent' :
                            'bg-muted-foreground'
                          }`} />
                          {candidate.availabilityStatus === 'available' ? 'Tersedia' :
                           candidate.availabilityStatus === 'open_to_offer' ? 'Terbuka' : 'Tidak Tersedia'}
                        </span>

                        {candidate.publicUrl && (
                           <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}${candidate.publicUrl}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary hover:underline whitespace-nowrap">
                            Lihat Paspor
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {candidatesPage && candidatesPage.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border mt-6 pt-6">
                <span className="text-xs text-muted-foreground">
                  Halaman {candidatesPage.page} dari {candidatesPage.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(candidatesPage.totalPages, p + 1))}
                    disabled={page === candidatesPage.totalPages}
                    className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </QueryState>

        </>
      )}

      {activeTab === 'requests' && <ConsentRequestsSection />}
    </div>
  );
}

function ConsentRequestsSection() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ListCompanyConsentRequestsStatus>('all');
  const requestParams = { page, status };
  const { data: requestsPage, isLoading, isError, refetch } = useListCompanyConsentRequests(requestParams, {
    query: { queryKey: getListCompanyConsentRequestsQueryKey(requestParams) }
  });

  const requestConsent = useRequestCompanyTalentConsent();
  const [slug, setSlug] = useState('');
  const [note, setNote] = useState('');

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;

    // Extract slug if URL was pasted
    let cleanSlug = slug;
    try {
      if (slug.includes('/passport/')) {
        cleanSlug = slug.split('/passport/')[1].split('?')[0].split('/')[0];
      }
    } catch (e) {
      // ignore
    }

    requestConsent.mutate({ data: { passportSlug: cleanSlug, note } }, {
      onSuccess: () => {
        setSlug('');
        setNote('');
        setPage(1);
        queryClient.invalidateQueries({ queryKey: getListCompanyConsentRequestsQueryKey() });
      },
      onError: (err) => {
        alert((err as any)?.error || 'Gagal mengajukan permintaan. Pastikan slug benar.');
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h2 className="text-lg font-bold mb-1">Ajukan Permintaan Akses</h2>
        <p className="text-sm text-muted-foreground mb-6">Masukkan slug atau tautan paspor anggota untuk meminta akses ke data profesional mereka.</p>

        <form onSubmit={handleRequest} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-bold mb-2">Slug atau URL Paspor</label>
            <input
              type="text"
              required
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="contoh-slug-anggota"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2">Catatan (Opsional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Pesan untuk anggota..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={!slug || requestConsent.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus size={16} /> {requestConsent.isPending ? 'Mengajukan...' : 'Ajukan Permintaan'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Riwayat Permintaan</h2>
            <p className="mt-1 text-xs text-muted-foreground">{requestsPage?.total ?? 0} permintaan ditemukan</p>
          </div>
          <select
            value={status}
            onChange={(event) => { setStatus(event.target.value as ListCompanyConsentRequestsStatus); setPage(1); }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold"
            aria-label="Filter status permintaan"
          >
            <option value="all">Semua status</option>
            <option value="requested">Menunggu</option>
            <option value="active">Aktif</option>
            <option value="denied">Ditolak</option>
            <option value="revoked">Dicabut</option>
            <option value="expired">Kedaluwarsa</option>
          </select>
        </div>

        <QueryState loading={isLoading} error={isError} retry={() => refetch()}>
          {requestsPage && (
            requestsPage.items.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground mb-4">
                  <FileText size={20} />
                </div>
                <p className="text-muted-foreground text-sm">Belum ada riwayat permintaan akses.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {requestsPage.items.map(req => (
                  <div key={req.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold">{req.passportSlug}</span>
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          req.status === 'active' ? 'bg-accent/10 text-accent' :
                          req.status === 'requested' ? 'bg-primary/10 text-primary' :
                          req.status === 'denied' ? 'bg-destructive/10 text-destructive' :
                          req.status === 'revoked' ? 'bg-destructive/10 text-destructive' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-4">
                        <span className="flex items-center gap-1.5"><Clock size={12} /> Diminta: {format(new Date(req.requestedAt), 'd MMM yyyy', { locale: dateLocaleId })}</span>
                        {req.expiresAt && <span>Kedaluwarsa: {format(new Date(req.expiresAt), 'd MMM yyyy', { locale: dateLocaleId })}</span>}
                      </div>
                      {req.requestNote && (
                        <p className="mt-2 text-xs border-l-2 border-border pl-2 text-muted-foreground italic">
                          "{req.requestNote}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </QueryState>
        {requestsPage && requestsPage.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-5">
            <span className="text-xs text-muted-foreground">Halaman {requestsPage.page} dari {requestsPage.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-50">Sebelumnya</button>
              <button type="button" onClick={() => setPage((value) => Math.min(requestsPage.totalPages, value + 1))} disabled={page >= requestsPage.totalPages} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-50">Berikutnya</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
