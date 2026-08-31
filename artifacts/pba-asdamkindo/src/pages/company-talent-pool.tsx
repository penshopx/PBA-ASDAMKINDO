import { useState, useEffect } from 'react';
import { useGetCompanyTalentPool, getGetCompanyTalentPoolQueryKey, GetCompanyTalentPoolAvailability, type GetCompanyTalentPoolParams } from '@workspace/api-client-react';
import { QueryState } from '@/components/ui-kit';
import { Search, MapPin, Briefcase, UserCircle, CheckCircle2, LayoutGrid, List } from 'lucide-react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

export function CompanyTalentPoolPage() {
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<GetCompanyTalentPoolAvailability | ''>('');
  const [location, setLocation] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const debouncedSearch = useDebounce(search, 400);
  const debouncedLocation = useDebounce(location, 400);

  const params: GetCompanyTalentPoolParams = {};
  if (debouncedSearch) params.search = debouncedSearch;
  if (availability) params.availability = availability;
  if (debouncedLocation) params.location = debouncedLocation;

  const { data: candidates, isLoading, isError, refetch } = useGetCompanyTalentPool(params, {
    query: { queryKey: getGetCompanyTalentPoolQueryKey(params) }
  });

  return (
    <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="eyebrow text-accent">Pencarian Kandidat</p>
        <h1 className="display-font mt-3 text-4xl font-semibold">Talent Pool</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
           Jelajahi profesional yang telah memberikan persetujuan untuk ditampilkan kepada perusahaan di ekosistem PBA.
        </p>
      </div>

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
        {candidates && (
          candidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted text-muted-foreground">
                <Search size={24} />
              </div>
              <h3 className="mt-4 text-lg font-bold">Kandidat tidak ditemukan</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                Coba sesuaikan filter pencarian Anda atau gunakan kata kunci yang lebih umum.
              </p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
              {candidates.map(candidate => (
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
      </QueryState>
    </div>
  );
}
