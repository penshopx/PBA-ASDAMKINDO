import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Award, BriefcaseBusiness, Check, ClipboardCheck, ExternalLink, FileText, GraduationCap, Save, Target, TrendingUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetMemberJourneyQueryKey,
  useGetMemberJourney,
  useSaveMemberDiagnostic,
  useSaveMemberEvidence,
  useUpdateMemberEvidence,
} from '@workspace/api-client-react';
import type { MemberEvidence, MemberEvidenceInputEvidenceType, MemberEvidenceInputStatus } from '@workspace/api-client-react';
import { QueryState } from '@/components/ui-kit';

const diagnosticQuestions = [
  { key: 'technical', label: 'Penguasaan teknis sesuai bidang', hint: 'Saya mampu menerapkan standar dan metode kerja yang relevan.' },
  { key: 'safety', label: 'Keselamatan dan kepatuhan kerja', hint: 'Saya konsisten menjalankan K3 dan prosedur proyek.' },
  { key: 'communication', label: 'Komunikasi dan kolaborasi', hint: 'Saya dapat menjelaskan keputusan kerja kepada tim dan pemangku kepentingan.' },
  { key: 'problemSolving', label: 'Pemecahan masalah', hint: 'Saya mampu mengambil keputusan saat menghadapi kendala di lapangan.' },
  { key: 'evidence', label: 'Kesiapan menunjukkan bukti', hint: 'Saya punya bukti kerja yang dapat memperkuat profil profesional.' },
] as const;

const scoreLabels = ['Belum siap', 'Perlu diperkuat', 'Cukup siap', 'Siap', 'Sangat siap'];
const statusLabel: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Menunggu verifikasi',
  changes_requested: 'Perlu diperbaiki',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
};
const typeLabel: Record<string, string> = { project: 'Proyek', certification: 'Sertifikasi', work: 'Bukti kerja' };
const emptyEvidence = { evidenceType: 'project' as MemberEvidenceInputEvidenceType, title: '', description: '', referenceUrl: '' };

export function MemberJourney() {
  const query = useGetMemberJourney({ query: { queryKey: getGetMemberJourneyQueryKey(), refetchOnMount: 'always' } });
  const client = useQueryClient();
  const diagnosticMutation = useSaveMemberDiagnostic();
  const evidenceMutation = useSaveMemberEvidence();
  const updateEvidenceMutation = useUpdateMemberEvidence();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [evidence, setEvidence] = useState(emptyEvidence);
  const [evidenceRequestId, setEvidenceRequestId] = useState(() => crypto.randomUUID());
  const [editingEvidenceId, setEditingEvidenceId] = useState<string | null>(null);
  const [opportunityOpen, setOpportunityOpen] = useState<string | null>(null);

  useEffect(() => {
    if (query.data?.diagnostic) setAnswers(query.data.diagnostic.answers);
  }, [query.data?.diagnostic]);

  const refresh = () => client.invalidateQueries({ queryKey: getGetMemberJourneyQueryKey() });
  const resetEvidence = () => {
    setEvidence(emptyEvidence);
    setEvidenceRequestId(crypto.randomUUID());
    setEditingEvidenceId(null);
  };
  const submitDiagnostic = (event: React.FormEvent) => {
    event.preventDefault();
    if (Object.keys(answers).length !== diagnosticQuestions.length) return;
    diagnosticMutation.mutate({
      data: {
        answers,
      },
    }, { onSuccess: refresh });
  };
  const saveEvidence = (status: MemberEvidenceInputStatus) => {
    if (!evidence.title.trim() || !evidence.description.trim()) return;
    const data = {
      evidenceType: evidence.evidenceType,
      title: evidence.title.trim(),
      description: evidence.description.trim(),
      referenceUrl: evidence.referenceUrl.trim() || null,
    };
    if (editingEvidenceId) {
      updateEvidenceMutation.mutate({
        id: editingEvidenceId,
        data: { ...data, ...(status === 'submitted' ? { status } : {}) },
      }, { onSuccess: () => { resetEvidence(); refresh(); } });
      return;
    }
    evidenceMutation.mutate({
      data: { clientRequestId: evidenceRequestId, ...data, status },
    }, { onSuccess: () => { resetEvidence(); refresh(); } });
  };
  const submitEvidence = (id: string) => updateEvidenceMutation.mutate({ id, data: { status: 'submitted' } }, { onSuccess: refresh });
  const repairEvidence = (item: MemberEvidence) => {
    setEditingEvidenceId(item.id);
    setEvidence({
      evidenceType: item.evidenceType,
      title: item.title,
      description: item.description,
      referenceUrl: item.referenceUrl ?? '',
    });
    window.setTimeout(() => document.getElementById('evidence-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };
  const evidencePending = evidenceMutation.isPending || updateEvidenceMutation.isPending;

  return <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <Link href="/member/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground" data-testid="link-journey-back"><ArrowLeft size={16} /> Kembali ke ringkasan</Link>
        <p className="eyebrow mt-7 text-accent">Member workspace / perjalanan</p>
        <h1 className="display-font mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Dari kompetensi<br />menjadi peluang.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">Selesaikan diagnostik, kuatkan bukti pengalaman, pantau progres belajar, lalu buka peluang yang paling dekat dengan profil Anda.</p>
      </div>
      <div className="rounded-2xl bg-sidebar p-5 text-sidebar-foreground sm:min-w-64"><p className="eyebrow text-primary">Empat langkah</p><div className="mt-4 flex items-center gap-2 text-xs font-bold"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">1</span><span className="h-px flex-1 bg-sidebar-border" /><span className="grid h-7 w-7 place-items-center rounded-full bg-sidebar-accent text-primary">2</span><span className="h-px flex-1 bg-sidebar-border" /><span className="grid h-7 w-7 place-items-center rounded-full bg-sidebar-accent text-primary">3</span><span className="h-px flex-1 bg-sidebar-border" /><span className="grid h-7 w-7 place-items-center rounded-full bg-sidebar-accent text-primary">4</span></div><p className="mt-3 text-xs text-sidebar-foreground/60">Profil → bukti → belajar → peluang</p></div>
    </div>
    <QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()}>
      {query.data && <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="max-w-xl"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-accent"><Target size={22} /></div><div><p className="eyebrow text-accent">01 / readiness diagnostic</p><h2 className="mt-1 text-2xl font-bold">Seberapa siap Anda hari ini?</h2></div></div><p className="mt-5 text-sm leading-relaxed text-muted-foreground">Jawab dengan kondisi saat ini. Hasilnya membantu Anda memilih area penguatan dan program yang paling relevan.</p></div>
            {query.data.diagnostic && <div className="flex items-center gap-4 rounded-xl bg-muted/70 p-4"><div className="grid h-16 w-16 place-items-center rounded-full border-4 border-accent/25 border-t-accent"><strong className="font-mono text-xl text-accent">{query.data.diagnostic.score}</strong></div><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Skor kesiapan</p><p className="mt-1 text-sm font-bold">{query.data.diagnostic.focusAreas.length ? 'Masih ada area penguatan' : 'Fondasi Anda kuat'}</p></div></div>}
          </div>
          {query.data.diagnostic?.focusAreas.length ? <div className="mt-6 flex flex-wrap gap-2">{query.data.diagnostic.focusAreas.map((area) => <span key={area} className="rounded-full bg-primary/15 px-3 py-1.5 text-xs font-bold text-accent">Perkuat: {area}</span>)}</div> : null}
          <form onSubmit={submitDiagnostic} className="mt-7 grid gap-4 border-t border-border pt-6 lg:grid-cols-2" data-testid="form-member-diagnostic">
            {diagnosticQuestions.map((question) => <label key={question.key} className="rounded-xl border border-border p-4"><span className="text-sm font-bold">{question.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{question.hint}</span><select value={answers[question.key] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: Number(event.target.value) }))} className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid={`select-diagnostic-${question.key}`}><option value="">Pilih penilaian</option>{scoreLabels.map((label, index) => <option key={label} value={index + 1}>{index + 1} — {label}</option>)}</select></label>)}
            <div className="flex flex-wrap items-center gap-3 lg:col-span-2"><button type="submit" disabled={diagnosticMutation.isPending || Object.keys(answers).length !== diagnosticQuestions.length} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-submit-diagnostic">{diagnosticMutation.isPending ? 'Menghitung…' : query.data.diagnostic ? 'Perbarui hasil diagnostik' : 'Lihat hasil saya'} <ArrowRight size={16} /></button>{diagnosticMutation.isError && <span className="text-xs font-semibold text-destructive">Diagnostik belum tersimpan. Coba lagi.</span>}</div>
          </form>
        </section>

        <section className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
          <div id="evidence-editor" className="rounded-2xl bg-sidebar p-6 text-sidebar-foreground sm:p-8">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-sidebar-accent text-primary"><FileText size={21} /></div><div><p className="eyebrow text-primary">02 / bukti kompetensi</p><h2 className="mt-1 text-xl font-bold">Bangun bukti yang dipercaya</h2></div></div>
            <p className="mt-5 text-sm leading-relaxed text-sidebar-foreground/65">{editingEvidenceId ? 'Perbaiki detail sesuai catatan Admin, lalu simpan sementara atau ajukan ulang untuk verifikasi.' : 'Simpan pengalaman proyek, sertifikasi, atau bukti kerja. Anda bisa menyimpan draft dulu atau langsung mengajukannya untuk verifikasi.'}</p>
            {editingEvidenceId && <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-primary/35 bg-primary/10 p-3 text-xs font-semibold"><span>Mode perbaikan bukti</span><button type="button" onClick={resetEvidence} className="font-bold text-primary hover:underline">Batal</button></div>}
            <div className="mt-6 space-y-3">
              <select value={evidence.evidenceType} onChange={(event) => setEvidence((current) => ({ ...current, evidenceType: event.target.value as MemberEvidenceInputEvidenceType }))} className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 py-3 text-sm outline-none" data-testid="select-evidence-type"><option value="project">Pengalaman proyek</option><option value="certification">Sertifikasi</option><option value="work">Bukti kerja</option></select>
              <input value={evidence.title} onChange={(event) => setEvidence((current) => ({ ...current, title: event.target.value }))} placeholder="Judul bukti, contoh: Supervisi gedung 12 lantai" className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 py-3 text-sm outline-none placeholder:text-sidebar-foreground/35 focus:border-primary" data-testid="input-evidence-title" />
              <textarea value={evidence.description} onChange={(event) => setEvidence((current) => ({ ...current, description: event.target.value }))} placeholder="Ceritakan peran, hasil, dan kompetensi yang digunakan…" className="min-h-28 w-full resize-y rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 py-3 text-sm outline-none placeholder:text-sidebar-foreground/35 focus:border-primary" data-testid="input-evidence-description" />
              <input value={evidence.referenceUrl} onChange={(event) => setEvidence((current) => ({ ...current, referenceUrl: event.target.value }))} placeholder="Tautan bukti (opsional)" className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 py-3 text-sm outline-none placeholder:text-sidebar-foreground/35 focus:border-primary" data-testid="input-evidence-url" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => saveEvidence('draft')} disabled={evidencePending} className="inline-flex items-center gap-2 rounded-lg border border-sidebar-border px-4 py-2.5 text-sm font-bold hover:bg-sidebar-accent disabled:opacity-50" data-testid="button-save-evidence-draft"><Save size={15} /> {editingEvidenceId ? 'Simpan perbaikan' : 'Simpan draft'}</button><button type="button" onClick={() => saveEvidence('submitted')} disabled={evidencePending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50" data-testid="button-submit-evidence">{editingEvidenceId ? 'Ajukan ulang' : 'Ajukan verifikasi'} <ArrowRight size={15} /></button></div>
            {(evidenceMutation.isError || updateEvidenceMutation.isError) && <p className="mt-3 text-xs font-semibold text-red-200">Bukti belum tersimpan. Periksa detail dan status bukti.</p>}
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow text-accent">Bukti tersimpan</p><h2 className="mt-1 text-xl font-bold">Portofolio Anda</h2></div><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">{query.data.evidences.length} item</span></div>{query.data.evidences.length ? <div className="mt-6 space-y-3">{query.data.evidences.map((item) => <div key={item.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wider text-accent">{typeLabel[item.evidenceType]}</span><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${item.status === 'verified' ? 'bg-accent/15 text-accent' : item.status === 'changes_requested' || item.status === 'rejected' ? 'bg-destructive/10 text-destructive' : item.status === 'submitted' ? 'bg-primary/15 text-foreground' : 'bg-muted text-muted-foreground'}`}>{item.status === 'verified' && <Check className="mr-1 inline" size={12} />}{statusLabel[item.status]}</span></div><h3 className="mt-2 text-sm font-bold">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>{item.status === 'submitted' && <p className="mt-2 text-xs font-semibold text-muted-foreground">Data dibekukan selama proses review.</p>}{item.status === 'rejected' && <p className="mt-2 text-xs font-semibold text-destructive">Keputusan ini final. Hubungi tim PBA bila perlu klarifikasi.</p>}</div>{item.status === 'draft' ? <button onClick={() => submitEvidence(item.id)} disabled={updateEvidenceMutation.isPending} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary" data-testid={`button-submit-evidence-${item.id}`}>Ajukan</button> : item.status === 'changes_requested' ? <button onClick={() => repairEvidence(item)} disabled={updateEvidenceMutation.isPending} className="shrink-0 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/5" data-testid={`button-repair-evidence-${item.id}`}>Perbaiki</button> : null}</div>{item.referenceUrl && <a href={item.referenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline">Buka bukti <ExternalLink size={13} /></a>}</div>)}</div> : <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center"><Award className="mx-auto text-muted-foreground" size={25} /><p className="mt-3 text-sm font-bold">Belum ada bukti tersimpan</p><p className="mt-1 text-xs text-muted-foreground">Mulai dari satu pengalaman yang paling relevan.</p></div>}</div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-accent">03 / learning loop</p><h2 className="mt-1 text-2xl font-bold">Progres belajar dan area gap</h2><p className="mt-2 text-sm text-muted-foreground">Gunakan area penguatan dari diagnostik untuk memilih langkah belajar berikutnya.</p></div><GraduationCap className="text-accent" size={28} /></div>{query.data.learningProgress.length ? <div className="mt-6 grid gap-4 md:grid-cols-2">{query.data.learningProgress.map((item) => <div key={item.id} className="rounded-xl border border-border p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-accent">{item.status === 'completed' ? 'Selesai' : 'Sedang berjalan'}</p><h3 className="mt-1 text-base font-bold">{item.programName}</h3></div><strong className="font-mono text-xl text-accent">{item.progress}%</strong></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${item.progress}%` }} /></div><p className="mt-3 text-xs text-muted-foreground">Milestone saat ini: <strong className="text-foreground">{item.currentMilestone}</strong></p><div className="mt-4 flex flex-wrap gap-1.5">{item.milestones.map((milestone, index) => <span key={milestone} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${index < Math.ceil(item.progress / 25) ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}`}>{index < Math.ceil(item.progress / 25) && <Check className="mr-1 inline" size={11} />}{milestone}</span>)}</div></div>)}</div> : <div className="mt-6 rounded-xl bg-muted/60 p-6"><p className="text-sm font-bold">Belum ada program yang sedang berjalan.</p><p className="mt-1 text-sm text-muted-foreground">Pilih rekomendasi di bawah untuk mulai menutup gap kompetensi Anda.</p></div>}<div className="mt-8 border-t border-border pt-6"><div className="flex items-center gap-2"><TrendingUp className="text-accent" size={18} /><h3 className="text-base font-bold">Rekomendasi program untuk Anda</h3></div><div className="mt-4 grid gap-3 md:grid-cols-3">{query.data.recommendedPrograms.map((program) => <Link href={`/programs/${program.id}`} key={program.id} className="group rounded-xl border border-border p-4 hover:-translate-y-0.5 hover:border-primary" data-testid={`link-recommended-program-${program.id}`}><p className="text-xs font-bold uppercase tracking-wider text-accent">{program.category}</p><h4 className="mt-2 text-sm font-bold">{program.name}</h4><p className="mt-2 text-xs text-muted-foreground">{program.duration} · {program.mode}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent">Lihat program <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" /></span></Link>)}</div></div></section>

        <section className="rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-primary-foreground/65">04 / peluang relevan</p><h2 className="mt-1 text-2xl font-bold">Peluang yang bisa Anda tindak lanjuti</h2><p className="mt-2 max-w-xl text-sm text-primary-foreground/75">Peluang di bawah ini sudah dipasangkan dengan profil Anda. Buka detailnya untuk melihat kebutuhan perusahaan dan skor kecocokan.</p></div><BriefcaseBusiness className="hidden opacity-70 sm:block" size={30} /></div>{query.data.opportunities.length ? <div className="mt-6 grid gap-3 md:grid-cols-2">{query.data.opportunities.map((opportunity) => <div key={opportunity.id} className="rounded-xl bg-primary-foreground/10 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/60">{opportunity.companyName}</p><h3 className="mt-1 text-base font-bold">{opportunity.requirement}</h3></div><span className="rounded-full bg-primary-foreground px-2.5 py-1 font-mono text-xs font-bold text-primary">{opportunity.score}% match</span></div><button onClick={() => setOpportunityOpen(opportunityOpen === opportunity.id ? null : opportunity.id)} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary-foreground underline-offset-4 hover:underline" data-testid={`button-open-opportunity-${opportunity.id}`}>{opportunityOpen === opportunity.id ? 'Tutup detail' : 'Buka detail peluang'} <ArrowRight size={14} /></button>{opportunityOpen === opportunity.id && <div className="mt-4 border-t border-primary-foreground/20 pt-4 text-sm text-primary-foreground/80"><p>Status saat ini: <strong className="text-primary-foreground">{opportunity.status === 'new' ? 'Baru' : opportunity.status === 'shortlisted' ? 'Masuk shortlist' : opportunity.status === 'interview' ? 'Tahap wawancara' : opportunity.status === 'placed' ? 'Ditempatkan' : 'Ditutup'}</strong></p><p className="mt-2">Perusahaan ini melihat kecocokan dengan kompetensi dan pengalaman Anda. Pastikan bukti terkait sudah diajukan.</p></div>}</div>)}</div> : <div className="mt-6 rounded-xl bg-primary-foreground/10 p-6"><p className="text-sm font-bold">Belum ada peluang yang dipasangkan.</p><p className="mt-1 text-sm text-primary-foreground/70">Lengkapi diagnostik dan bukti kerja agar PBA dapat menampilkan kebutuhan yang paling relevan.</p></div>}</section>
      </div>}
    </QueryState>
  </div>;
}