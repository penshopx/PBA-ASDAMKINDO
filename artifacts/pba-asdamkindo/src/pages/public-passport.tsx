import { useParams, Link } from 'wouter';
import { useGetPublicPassport, getGetPublicPassportQueryKey } from '@workspace/api-client-react';
import { QueryState } from '@/components/ui-kit';
import { MapPin, Briefcase, Calendar, CheckCircle2, Award, UserCircle } from 'lucide-react';
import { Brand } from '@/components/brand';

export function PublicPassportPage() {
  const params = useParams();
  const slug = params.slug || '';
  
  const { data: passport, isLoading, isError } = useGetPublicPassport(slug, {
    query: { queryKey: getGetPublicPassportQueryKey(slug), retry: false }
  });

  if (isError) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-5 text-center">
        <div className="mb-8"><Brand /></div>
        <p className="eyebrow text-accent">404 / Privat</p>
        <h1 className="display-font mt-4 text-4xl font-semibold">Paspor tidak ditemukan.</h1>
        <p className="mt-4 max-w-sm text-sm text-muted-foreground">
          Tautan ini tidak valid, atau pemilik paspor mengatur profilnya ke mode privat.
        </p>
        <Link href="/" className="mt-8 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background selection:bg-primary/30">
      <header className="border-b border-border bg-card px-5 py-4 sm:px-8">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Brand />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Professional Passport</span>
        </div>
      </header>
      
      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <QueryState loading={isLoading} error={false} retry={() => {}}>
          {passport && (
            <div className="space-y-10">
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="grid h-32 w-32 shrink-0 place-items-center rounded-3xl bg-primary/10 text-primary">
                  <UserCircle size={64} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h1 className="display-font text-4xl font-bold sm:text-5xl">{passport.name}</h1>
                    <span className="flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                      <CheckCircle2 size={14} /> Profil publik PBA
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-medium text-foreground/80">{passport.headline}</p>
                  
                  <div className="mt-5 flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5"><MapPin size={16} /> {passport.domicile}</span>
                    <span className="flex items-center gap-1.5"><Briefcase size={16} /> {passport.expertise}</span>
                    <span className="flex items-center gap-1.5"><Calendar size={16} /> {passport.experienceYears} tahun pengalaman</span>
                  </div>
                </div>
              </div>
              
              <div className="grid gap-8 md:grid-cols-3">
                <div className="md:col-span-2 space-y-8">
                  <section>
                    <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><UserCircle size={18} className="text-primary"/> Tentang</h2>
                    <div className="rounded-2xl border border-border bg-card p-6 leading-relaxed text-sm">
                      {passport.bio ? passport.bio : <span className="text-muted-foreground italic">Belum ada deskripsi.</span>}
                    </div>
                  </section>
                  
                  <section>
                    <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Award size={18} className="text-primary"/> Preferensi Peran & Lokasi</h2>
                    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-3">Peran Pilihan</p>
                        <div className="flex flex-wrap gap-2">
                          {passport.preferredRoles?.length ? passport.preferredRoles.map((role, i) => (
                            <span key={i} className="rounded-lg bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">{role}</span>
                          )) : <span className="text-sm text-muted-foreground">Tidak ditentukan</span>}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-3">Lokasi Kerja</p>
                        <div className="flex flex-wrap gap-2">
                          {passport.preferredLocations?.length ? passport.preferredLocations.map((loc, i) => (
                            <span key={i} className="rounded-lg bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">{loc}</span>
                          )) : <span className="text-sm text-muted-foreground">Tidak ditentukan</span>}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
                
                <div className="space-y-6">
                  <div className="rounded-2xl bg-sidebar p-6 text-sidebar-foreground">
                    <p className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/60 mb-2">Status Ketersediaan</p>
                    <div className="flex items-center gap-2 text-lg font-bold">
                      <span className={`h-3 w-3 rounded-full ${passport.availabilityStatus === 'available' ? 'bg-primary' : passport.availabilityStatus === 'open_to_offer' ? 'bg-accent' : 'bg-sidebar-foreground/30'}`} />
                      {passport.availabilityStatus === 'available' ? 'Tersedia' : passport.availabilityStatus === 'open_to_offer' ? 'Terbuka (Pasif)' : 'Tidak Tersedia'}
                    </div>
                    
                    <div className="mt-8">
                      <p className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/60 mb-2">Sistem Kerja</p>
                      <div className="flex flex-wrap gap-2">
                        {passport.preferredWorkModes?.map((mode, i) => (
                          <span key={i} className="rounded border border-sidebar-border bg-sidebar-accent px-2 py-1 text-xs font-medium">
                            {mode === 'onsite' ? 'Di Lokasi' : mode === 'hybrid' ? 'Hibrida' : 'Jarak Jauh'}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="rounded-2xl border border-border p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">Bukti Terverifikasi</p>
                      <p className="text-3xl font-mono font-bold mt-1">{passport.verifiedEvidenceCount}</p>
                    </div>
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent">
                      <Award size={24} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </QueryState>
      </main>
    </div>
  );
}
