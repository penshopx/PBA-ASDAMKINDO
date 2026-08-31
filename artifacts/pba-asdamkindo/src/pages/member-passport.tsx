import { useState, useEffect } from 'react';
import { 
  useGetMemberPassport, 
  useUpdateMemberPassport, 
  useUpdateMemberPassportConsent, 
  getGetMemberPassportQueryKey,
  type ProfessionalPassportUpdate,
  type ProfessionalPassportUpdateAvailabilityStatus,
  type ProfessionalPassportUpdatePreferredWorkModesItem,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/ui-kit';
import { Globe, Save, ShieldAlert, ShieldCheck, ExternalLink, CheckCircle2 } from 'lucide-react';

function ToggleSwitch({ checked, onChange }: { checked: boolean, onChange: (c: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

export function MemberPassportPage() {
  const queryClient = useQueryClient();
  const { data: passport, isLoading, isError, refetch } = useGetMemberPassport({
    query: { queryKey: getGetMemberPassportQueryKey() }
  });
  const updatePassport = useUpdateMemberPassport();
  const updateConsent = useUpdateMemberPassportConsent();
  
  const [formData, setFormData] = useState({
    slug: '',
    isPublic: false,
    headline: '',
    bio: '',
    preferredRoles: '',
    preferredLocations: '',
    preferredWorkModes: [] as ProfessionalPassportUpdatePreferredWorkModesItem[],
    availabilityStatus: 'unavailable' as ProfessionalPassportUpdateAvailabilityStatus
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (passport) {
      setFormData({
        slug: passport.slug || '',
        isPublic: passport.isPublic || false,
        headline: passport.headline || '',
        bio: passport.bio || '',
        preferredRoles: (passport.preferredRoles || []).join(', '),
        preferredLocations: (passport.preferredLocations || []).join(', '),
        preferredWorkModes: (passport.preferredWorkModes || []).filter(
          (mode): mode is ProfessionalPassportUpdatePreferredWorkModesItem =>
            mode === 'onsite' || mode === 'hybrid' || mode === 'remote',
        ),
        availabilityStatus: passport.availabilityStatus || 'unavailable'
      });
    }
  }, [passport]);

  const handleSave = () => {
    setIsSaving(true);
    setSaveSuccess(false);
    
    const payload: ProfessionalPassportUpdate = {
      slug: formData.slug,
      isPublic: formData.isPublic,
      headline: formData.headline,
      bio: formData.bio,
      preferredRoles: formData.preferredRoles.split(',').map(s => s.trim()).filter(Boolean),
      preferredLocations: formData.preferredLocations.split(',').map(s => s.trim()).filter(Boolean),
      preferredWorkModes: formData.preferredWorkModes,
      availabilityStatus: formData.availabilityStatus,
    };
    
    updatePassport.mutate({ data: payload }, {
      onSuccess: (data) => {
        setIsSaving(false);
        setSaveSuccess(true);
        queryClient.setQueryData(getGetMemberPassportQueryKey(), data);
        setTimeout(() => setSaveSuccess(false), 3000);
      },
      onError: () => {
        setIsSaving(false);
        alert('Gagal menyimpan perubahan. Periksa kembali isian Anda.');
      }
    });
  };

  const toggleConsent = (active: boolean) => {
    updateConsent.mutate({ data: { active } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMemberPassportQueryKey() });
      }
    });
  };

  const handleWorkModeToggle = (mode: ProfessionalPassportUpdatePreferredWorkModesItem) => {
    setFormData(prev => {
      if (prev.preferredWorkModes.includes(mode)) {
        return { ...prev, preferredWorkModes: prev.preferredWorkModes.filter(m => m !== mode) };
      }
      return { ...prev, preferredWorkModes: [...prev.preferredWorkModes, mode] };
    });
  };

  const passportHref = passport?.publicUrl
    ? `${import.meta.env.BASE_URL.replace(/\/$/, '')}${passport.publicUrl}`
    : '';
  const absolutePassportUrl = passportHref
    ? new URL(passportHref, window.location.origin).toString()
    : '';

  return (
    <div className="mx-auto max-w-5xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
      <QueryState loading={isLoading} error={isError} retry={() => refetch()}>
        {passport && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
              <div>
                <p className="eyebrow text-accent">Manajemen Profil</p>
                <h1 className="display-font mt-3 text-4xl font-semibold leading-tight">Paspor Profesional</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Kelola identitas publik dan preferensi karir Anda. Paspor ini merepresentasikan profil Anda di ekosistem PBA.
                </p>
              </div>
              {passport.isPublic && passport.publicUrl && (
                <a href={passportHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/20">
                  <ExternalLink size={16} /> Lihat Paspor Publik
                </a>
              )}
            </div>
            
            <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
              <div className="space-y-6">
                <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                  <h2 className="text-lg font-bold">Informasi Dasar</h2>
                  <p className="mb-6 mt-1 text-sm text-muted-foreground">Informasi ini akan tampil pada URL paspor Anda jika disetel publik.</p>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-bold">Headline Profesional</label>
                      <input 
                        type="text" 
                        value={formData.headline} 
                        onChange={(e) => setFormData({...formData, headline: e.target.value})} 
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Contoh: Senior Site Supervisor | Ahli K3"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">Ringkasan Bio</label>
                      <textarea 
                        value={formData.bio} 
                        onChange={(e) => setFormData({...formData, bio: e.target.value})} 
                        rows={4}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Ceritakan pengalaman dan keahlian Anda secara singkat..."
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">Custom URL (Slug)</label>
                      <div className="flex rounded-lg border border-border bg-background overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                        <span className="bg-muted px-3 py-2 text-sm text-muted-foreground border-r border-border flex items-center">
                           /passport/
                        </span>
                        <input 
                          type="text" 
                          value={formData.slug} 
                          onChange={(e) => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})} 
                          className="w-full bg-transparent px-3 py-2 text-sm focus:outline-none"
                          placeholder="nama-anda"
                        />
                      </div>
                    </div>
                  </div>
                </section>
                
                <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                  <h2 className="text-lg font-bold">Preferensi Karir</h2>
                  <p className="mb-6 mt-1 text-sm text-muted-foreground">Bantu sistem mencocokkan Anda dengan peluang yang tepat.</p>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-bold">Peran yang Diminati <span className="text-muted-foreground font-normal">(Pisahkan dengan koma)</span></label>
                      <input 
                        type="text" 
                        value={formData.preferredRoles} 
                        onChange={(e) => setFormData({...formData, preferredRoles: e.target.value})} 
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Site Manager, Estimator, dsb"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">Lokasi Pilihan <span className="text-muted-foreground font-normal">(Pisahkan dengan koma)</span></label>
                      <input 
                        type="text" 
                        value={formData.preferredLocations} 
                        onChange={(e) => setFormData({...formData, preferredLocations: e.target.value})} 
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Jakarta, Jawa Barat, Kalimantan Timur"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">Sistem Kerja Pilihan</label>
                      <div className="flex flex-wrap gap-2">
                         {(['onsite', 'hybrid', 'remote'] as ProfessionalPassportUpdatePreferredWorkModesItem[]).map(mode => (
                          <button 
                            key={mode} 
                            onClick={() => handleWorkModeToggle(mode)}
                            className={`rounded-full px-4 py-1.5 text-xs font-bold border transition-colors ${formData.preferredWorkModes.includes(mode) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-foreground hover:border-primary/50'}`}
                          >
                            {mode === 'onsite' ? 'Di Lokasi' : mode === 'hybrid' ? 'Hibrida' : 'Jarak Jauh'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">Status Ketersediaan</label>
                      <select 
                        value={formData.availabilityStatus} 
                         onChange={(e) => setFormData({...formData, availabilityStatus: e.target.value as ProfessionalPassportUpdateAvailabilityStatus})}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                      >
                        <option value="available">Tersedia Saat Ini</option>
                        <option value="open_to_offer">Terbuka untuk Tawaran (Pasif)</option>
                        <option value="unavailable">Tidak Tersedia</option>
                      </select>
                    </div>
                  </div>
                </section>
                
                <div className="flex items-center justify-end gap-4 pt-2">
                  {saveSuccess && <span className="flex items-center text-sm font-bold text-primary animate-in fade-in slide-in-from-bottom-2"><CheckCircle2 size={16} className="mr-1.5" /> Tersimpan</span>}
                  <button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <Save size={18} /> {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </div>
              
              <div className="space-y-6">
                <section className={`rounded-2xl border p-6 transition-colors ${formData.isPublic ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-lg font-bold flex items-center gap-2"><Globe size={18} /> Profil Publik</h2>
                      <p className="text-xs font-bold text-muted-foreground mt-1 uppercase tracking-wider">{formData.isPublic ? 'Aktif' : 'Nonaktif'}</p>
                    </div>
                    <ToggleSwitch 
                      checked={formData.isPublic} 
                      onChange={(val) => setFormData({...formData, isPublic: val})} 
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formData.isPublic 
                      ? 'Paspor Anda dapat diakses oleh siapa saja menggunakan tautan unik Anda.'
                       : 'Tautan publik Anda nonaktif. Perusahaan tetap dapat melihat ringkasan profil bila persetujuan Talent Pool aktif.'}
                  </p>
                  
                  {formData.isPublic && passport.publicUrl && (
                    <div className="mt-5 rounded-lg bg-background p-3 text-xs border border-primary/20">
                       <p className="font-mono text-muted-foreground break-all">{absolutePassportUrl}</p>
                    </div>
                  )}
                </section>

                <section className={`rounded-2xl border p-6 ${passport.consent.status === 'active' ? 'border-accent bg-accent/5' : 'border-border bg-card'}`}>
                  <div className="mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      {passport.consent.status === 'active' ? <ShieldCheck size={18} className="text-accent" /> : <ShieldAlert size={18} />} 
                      Talent Pool
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground mb-5">
                    Persetujuan Talent Pool mengizinkan perusahaan di ekosistem PBA untuk menemukan profil Anda berdasarkan kesesuaian keahlian dan lokasi.
                  </p>
                  
                  {passport.consent.status === 'active' ? (
                    <div className="space-y-4 border-t border-accent/20 pt-5 mt-5">
                      <div className="rounded-lg bg-accent/10 p-3.5 text-sm font-bold text-accent border border-accent/20">
                        Profil Anda dapat ditemukan oleh perusahaan mitra.
                      </div>
                      <button 
                        onClick={() => {
                          if(confirm('Yakin ingin mencabut persetujuan? Perusahaan tidak akan bisa lagi menemukan profil Anda di Talent Pool.')) {
                            toggleConsent(false);
                          }
                        }}
                        className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      >
                        Cabut Persetujuan
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 border-t border-border pt-5 mt-5">
                      <div className="rounded-lg bg-muted p-3.5 text-sm font-medium text-muted-foreground">
                        Profil Anda tersembunyi dari pencarian perusahaan.
                      </div>
                      <button 
                        onClick={() => toggleConsent(true)}
                        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:bg-accent/90 transition-colors"
                      >
                        Izinkan Akses Talent Pool
                      </button>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
