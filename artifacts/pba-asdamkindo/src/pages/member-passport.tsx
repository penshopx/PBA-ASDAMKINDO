import { useState, useEffect } from 'react';
import {
  useGetMemberPassport,
  useUpdateMemberPassport,
  getGetMemberPassportQueryKey,
  useListMemberCompanies,
  useGrantMemberCompanyConsent,
  useUpdateMemberCompanyConsent,
  type ProfessionalPassportUpdate,
  type ProfessionalPassportUpdateAvailabilityStatus,
  type ProfessionalPassportUpdatePreferredWorkModesItem,
  type MemberCompanyConsentUpdateAction,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/ui-kit';
import { Globe, Save, ShieldAlert, ShieldCheck, ExternalLink, CheckCircle2, Building2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { id as dateLocaleId } from 'date-fns/locale';

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

                <CompanyConsentsSection consents={passport.consents || []} />
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
                       : 'Tautan publik Anda nonaktif. Perusahaan tetap dapat melihat ringkasan profil bila Anda telah memberikan akses Talent Pool kepada mereka.'}
                  </p>

                  {formData.isPublic && passport.publicUrl && (
                    <div className="mt-5 rounded-lg bg-background p-3 text-xs border border-primary/20">
                       <p className="font-mono text-muted-foreground break-all">{absolutePassportUrl}</p>
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

function CompanyConsentsSection({ consents }: { consents: any[] }) {
  const queryClient = useQueryClient();
  const { data: companies, isLoading: companiesLoading } = useListMemberCompanies({ query: { queryKey: ['member-companies'] } });
  const grantConsent = useGrantMemberCompanyConsent();
  const updateConsent = useUpdateMemberCompanyConsent();

  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const handleGrantNew = () => {
    if (!selectedCompanyId) return;
    grantConsent.mutate({ data: { companyId: selectedCompanyId } }, {
      onSuccess: () => {
        setSelectedCompanyId('');
        queryClient.invalidateQueries({ queryKey: getGetMemberPassportQueryKey() });
      }
    });
  };

  const handleUpdate = (id: string, action: MemberCompanyConsentUpdateAction) => {
    updateConsent.mutate({ id, data: { action } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMemberPassportQueryKey() });
      }
    });
  };

  const availableCompanies = companies?.filter(c => !consents.some(cons => cons.companyId === c.id)) || [];

  return (
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h2 className="text-lg font-bold">Akses Talent Pool Perusahaan</h2>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Kelola permintaan dan akses Talent Pool spesifik untuk setiap perusahaan.</p>

      <div className="space-y-4 mb-8">
        <div className="flex gap-2">
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            disabled={companiesLoading || availableCompanies.length === 0}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value="">-- Pilih Perusahaan --</option>
            {availableCompanies.map(c => (
              <option key={c.id} value={c.id}>{c.companyName} ({c.companyType})</option>
            ))}
          </select>
          <button
            onClick={handleGrantNew}
            disabled={!selectedCompanyId || grantConsent.isPending}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus size={16} /> {grantConsent.isPending ? 'Memproses...' : 'Beri Akses'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {consents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Belum ada permintaan atau akses ke perusahaan manapun.
          </div>
        ) : (
          consents.map(consent => (
            <div key={consent.id} className="rounded-lg border border-border bg-background p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-muted-foreground" />
                  <span className="font-bold text-sm">{consent.companyName}</span>
                  <span className="text-xs text-muted-foreground border px-1.5 py-0.5 rounded">{consent.companyType}</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  <p>Status: <strong className={
                    consent.status === 'active' ? 'text-accent' :
                    consent.status === 'requested' ? 'text-primary' :
                    consent.status === 'revoked' ? 'text-destructive' : 'text-muted-foreground'
                  }>{consent.status.toUpperCase()}</strong></p>
                  {consent.status === 'active' && consent.grantedAt && <p>Diberikan: {format(new Date(consent.grantedAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                  {consent.status === 'requested' && <p>Diminta: {format(new Date(consent.requestedAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                  {consent.deniedAt && <p>Ditolak: {format(new Date(consent.deniedAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                  {consent.revokedAt && <p>Dicabut: {format(new Date(consent.revokedAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                  {consent.expiredAt && <p>Berakhir: {format(new Date(consent.expiredAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                  {consent.expiresAt && <p>Kedaluwarsa: {format(new Date(consent.expiresAt), 'd MMM yyyy', { locale: dateLocaleId })}</p>}
                  <p>Versi consent: v{consent.consentVersion}</p>
                  {consent.history?.length > 0 && (
                    <details className="pt-1">
                      <summary className="cursor-pointer font-bold text-foreground">Lihat riwayat status ({consent.history.length})</summary>
                      <ol className="mt-2 space-y-2 border-l border-border pl-3">
                        {consent.history.map((entry: any, index: number) => (
                          <li key={`${entry.action}-${entry.createdAt}-${index}`}>
                            <span className="font-semibold text-foreground">v{entry.consentVersion} · {entry.toStatus || entry.action}</span>
                            {' · '}{format(new Date(entry.createdAt), 'd MMM yyyy, HH:mm', { locale: dateLocaleId })}
                            {entry.note && <span className="block">{entry.note}</span>}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {consent.status === 'requested' && (
                  <>
                    <button
                      onClick={() => handleUpdate(consent.id, 'grant')}
                      disabled={updateConsent.isPending}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Terima
                    </button>
                    <button
                      onClick={() => handleUpdate(consent.id, 'deny')}
                      disabled={updateConsent.isPending}
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50"
                    >
                      Tolak
                    </button>
                  </>
                )}
                {consent.status === 'active' && (
                  <button
                    onClick={() => {
                      if (confirm(`Yakin ingin mencabut akses Talent Pool dari ${consent.companyName}?`)) {
                        handleUpdate(consent.id, 'revoke');
                      }
                    }}
                    disabled={updateConsent.isPending}
                    className="rounded-lg bg-destructive/10 text-destructive px-3 py-1.5 text-xs font-bold hover:bg-destructive/20 disabled:opacity-50"
                  >
                    Cabut Akses
                  </button>
                )}
                {['denied', 'revoked', 'expired'].includes(consent.status) && (
                  <button
                    onClick={() => handleUpdate(consent.id, 'grant')}
                    disabled={updateConsent.isPending}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Aktifkan Kembali
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
