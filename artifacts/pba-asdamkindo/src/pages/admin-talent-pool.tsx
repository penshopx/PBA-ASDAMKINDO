import { useState, useEffect } from 'react';
import { useGetAdminTalentPool, getGetAdminTalentPoolQueryKey, GetAdminTalentPoolAvailability, GetAdminTalentPoolConsent, type GetAdminTalentPoolParams } from '@workspace/api-client-react';
import { QueryState } from '@/components/ui-kit';
import { Search, MapPin, UserCircle, ShieldCheck, ShieldAlert } from 'lucide-react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

export function AdminTalentPoolPage() {
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<GetAdminTalentPoolAvailability | ''>('');
  const [consent, setConsent] = useState<GetAdminTalentPoolConsent | ''>('');
  const [location, setLocation] = useState('');

  const debouncedSearch = useDebounce(search, 400);
  const debouncedLocation = useDebounce(location, 400);

  const params: GetAdminTalentPoolParams = {};
  if (debouncedSearch) params.search = debouncedSearch;
  if (availability) params.availability = availability;
  if (consent) params.consent = consent;
  if (debouncedLocation) params.location = debouncedLocation;

  const { data: candidates, isLoading, isError, refetch } = useGetAdminTalentPool(params, {
    query: { queryKey: getGetAdminTalentPoolQueryKey(params) }
  });

  return (
    <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="eyebrow text-accent">Pusat Data</p>
        <h1 className="display-font mt-3 text-4xl font-semibold">Manajemen Talent Pool</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
          Pantau seluruh anggota yang terdaftar dalam ekosistem. Anda memiliki akses untuk melihat status persetujuan Talent Pool masing-masing anggota.
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Cari nama atau keahlian..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="relative">
          <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Lokasi..." 
            value={location}
            onChange={e => setLocation(e.target.value)}
            className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <select 
            value={availability}
            onChange={e => setAvailability(e.target.value as GetAdminTalentPoolAvailability | '')}
            className="w-full rounded-lg border border-border bg-card py-2.5 px-3 text-sm focus:border-primary focus:outline-none appearance-none"
          >
            <option value="">Semua Ketersediaan</option>
            <option value="available">Tersedia</option>
            <option value="open_to_offer">Terbuka (Pasif)</option>
            <option value="unavailable">Tidak Tersedia</option>
          </select>
        </div>
        <div>
          <select 
            value={consent}
            onChange={e => setConsent(e.target.value as GetAdminTalentPoolConsent | '')}
            className="w-full rounded-lg border border-border bg-card py-2.5 px-3 text-sm focus:border-primary focus:outline-none appearance-none"
          >
            <option value="">Semua Status Persetujuan</option>
            <option value="active">Persetujuan Aktif</option>
            <option value="revoked">Persetujuan Dicabut</option>
          </select>
        </div>
      </div>

      <QueryState loading={isLoading} error={isError} retry={() => refetch()}>
        {candidates && (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Kandidat</th>
                    <th className="px-5 py-4 font-semibold">Keahlian & Pengalaman</th>
                    <th className="px-5 py-4 font-semibold">Lokasi</th>
                    <th className="px-5 py-4 font-semibold">Status Ketersediaan</th>
                    <th className="px-5 py-4 font-semibold">Status Talent Pool</th>
                    <th className="px-5 py-4 font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {candidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-muted-foreground">
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground mb-4">
                          <Search size={20} />
                        </div>
                        Tidak ada kandidat yang cocok dengan filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    candidates.map(candidate => (
                      <tr key={candidate.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                              <UserCircle size={20} />
                            </div>
                            <div>
                              <p className="font-bold">{candidate.name}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{candidate.headline}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium truncate max-w-[200px]">{candidate.expertise}</p>
                          <p className="text-xs text-muted-foreground">{candidate.experienceYears} tahun</p>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{candidate.domicile}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
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
                        </td>
                        <td className="px-5 py-4">
                          {candidate.consentStatus === 'active' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-accent"><ShieldCheck size={14}/> Aktif</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-destructive/80"><ShieldAlert size={14}/> Dicabut</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {candidate.isPublic && candidate.publicUrl ? (
                             <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}${candidate.publicUrl}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline">
                              Lihat Paspor
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">Privat</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
