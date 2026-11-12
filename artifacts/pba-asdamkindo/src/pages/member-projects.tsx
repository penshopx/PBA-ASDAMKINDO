import { useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, Check, ExternalLink, FilePlus2, FolderKanban } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetMemberJourneyQueryKey,
  useGetMemberJourney,
  useSaveMemberEvidence,
  useUpdateMemberEvidence,
} from '@workspace/api-client-react';
import type { MemberEvidence } from '@workspace/api-client-react';
import { QueryState } from '@/components/ui-kit';

type ProjectForm = { title: string; description: string; referenceUrl: string };
const blankProject: ProjectForm = { title: '', description: '', referenceUrl: '' };
const statusLabel: Record<MemberEvidence['status'], string> = {
  draft: 'Draft',
  submitted: 'Menunggu verifikasi',
  changes_requested: 'Perlu diperbaiki',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
};

function statusStyle(status: MemberEvidence['status']) {
  if (status === 'verified') return 'bg-emerald-100 text-emerald-800';
  if (status === 'changes_requested' || status === 'rejected') return 'bg-rose-100 text-rose-800';
  if (status === 'submitted') return 'bg-sky-100 text-sky-800';
  return 'bg-muted text-muted-foreground';
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

export function MemberProjects() {
  const query = useGetMemberJourney({ query: { queryKey: getGetMemberJourneyQueryKey(), refetchOnMount: 'always' } });
  const client = useQueryClient();
  const createEvidence = useSaveMemberEvidence();
  const updateEvidence = useUpdateMemberEvidence();
  const [form, setForm] = useState<ProjectForm>(blankProject);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const projects = (query.data?.evidences ?? []).filter((item) => item.evidenceType === 'project');
  const editable = projects.find((item) => item.id === editingId);
  const pending = createEvidence.isPending || updateEvidence.isPending;

  const resetForm = () => {
    setForm(blankProject);
    setEditingId(null);
    setFormError('');
    setRequestId(crypto.randomUUID());
  };

  const saveProject = async (event: FormEvent<HTMLFormElement>, status: 'draft' | 'submitted') => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    const title = form.title.trim();
    const description = form.description.trim();
    const referenceUrl = form.referenceUrl.trim() || null;
    if (title.length < 2 || !description) {
      setFormError('Tambahkan judul dan deskripsi proyek sebelum menyimpan.');
      return;
    }
    if (referenceUrl && !/^https?:\/\//i.test(referenceUrl)) {
      setFormError('Tautan referensi harus diawali http:// atau https://.');
      return;
    }

    try {
      if (editingId) {
        await updateEvidence.mutateAsync({
          id: editingId,
          data: {
            title,
            description,
            referenceUrl,
            ...(status === 'submitted' ? { status } : editable?.status === 'changes_requested' ? {} : { status: 'draft' }),
          },
        });
      } else {
        await createEvidence.mutateAsync({
          data: {
            clientRequestId: requestId,
            evidenceType: 'project',
            title,
            description,
            referenceUrl,
            status,
          },
        });
      }
      await client.invalidateQueries({ queryKey: getGetMemberJourneyQueryKey() });
      const keptForRevision = editingId && editable?.status === 'changes_requested' && status === 'draft';
      resetForm();
      setNotice(status === 'submitted'
        ? 'Proyek berhasil diajukan untuk verifikasi.'
        : keptForRevision
          ? 'Perbaikan tersimpan. Ajukan kembali saat siap.'
          : 'Draft proyek tersimpan.');
    } catch {
      setFormError('Perubahan belum tersimpan. Periksa koneksi, lalu coba lagi.');
    }
  };

  const submitDraft = async (item: MemberEvidence) => {
    setWorkingId(item.id);
    setNotice('');
    try {
      await updateEvidence.mutateAsync({ id: item.id, data: { status: 'submitted' } });
      await client.invalidateQueries({ queryKey: getGetMemberJourneyQueryKey() });
      setNotice('Proyek berhasil diajukan untuk verifikasi.');
    } catch {
      setNotice('Pengajuan belum berhasil. Coba lagi saat koneksi tersedia.');
    } finally {
      setWorkingId(null);
    }
  };

  const editProject = (item: MemberEvidence) => {
    setEditingId(item.id);
    setForm({ title: item.title, description: item.description, referenceUrl: item.referenceUrl ?? '' });
    setFormError('');
    setNotice('');
    document.getElementById('project-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-11">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div>
        <Link href="/member/journey" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground" data-testid="link-projects-journey"><ArrowRight className="rotate-180" size={15} /> Perjalanan kompetensi</Link>
        <p className="eyebrow mt-6 text-accent">Member workspace / portofolio proyek</p>
        <h1 className="display-font mt-2 text-4xl font-semibold sm:text-5xl">Pengalaman, tersusun.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Catat kontribusi proyek dengan kata-kata Anda sendiri. Simpan sebagai draft, lalu ajukan untuk ditinjau. Anda mengendalikan catatan yang tersimpan di akun PBA.</p>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><FolderKanban size={20} /></span>
        <span><strong className="block text-xl font-bold leading-none">{projects.length}</strong><span className="mt-1 block text-xs text-muted-foreground">catatan proyek</span></span>
      </div>
    </div>

    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <span className="flex items-center gap-2"><BriefcaseBusiness size={17} className="shrink-0 text-sky-700" /> Portofolio ini merupakan bagian dari catatan kompetensi pribadi Anda.</span>
      <Link href="/member/journey" className="inline-flex shrink-0 items-center gap-1 font-bold text-sky-800 hover:underline" data-testid="link-projects-journey-path">Buka jalur kompetensi <ArrowRight size={14} /></Link>
    </div>

    {notice && <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900" data-testid="status-project-notice">{notice}</p>}

    <QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()}>
      {query.data && <div className="grid items-start gap-6 lg:grid-cols-[.82fr_1.18fr]">
        <section id="project-editor" className="scroll-mt-24 rounded-2xl bg-sidebar p-5 text-sidebar-foreground sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sidebar-accent text-primary"><FilePlus2 size={19} /></span>
            <div><p className="eyebrow text-primary">Catatan proyek</p><h2 className="mt-1 text-xl font-bold">{editable ? 'Perbarui detail proyek' : 'Tambahkan pengalaman'}</h2></div>
          </div>
          <p className="mt-4 text-sm leading-6 text-sidebar-foreground/70">Jelaskan peran, lingkup pekerjaan, dan hasil yang ingin Anda dokumentasikan. Hindari mencantumkan informasi rahasia proyek.</p>
          {editable?.status === 'changes_requested' && <p className="mt-4 rounded-lg border border-amber-200/30 bg-amber-200/10 p-3 text-xs leading-5 text-amber-100">Catatan ini memerlukan perbaikan. Perbarui detailnya, lalu ajukan kembali untuk verifikasi.</p>}
          <form className="mt-5 space-y-4" onSubmit={(event) => {
            const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            void saveProject(event, submitter?.dataset.status === 'submitted' ? 'submitted' : 'draft');
          }} data-testid="form-project-editor">
            <div>
              <label htmlFor="project-title" className="mb-1.5 block text-xs font-bold">Nama proyek <span className="text-primary">*</span></label>
              <input id="project-title" required minLength={2} maxLength={100} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Contoh: Renovasi gedung layanan publik" className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 py-3 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid="input-project-title" />
            </div>
            <div>
              <label htmlFor="project-description" className="mb-1.5 block text-xs font-bold">Peran dan pengalaman <span className="text-primary">*</span></label>
              <textarea id="project-description" required minLength={1} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Ceritakan kontribusi, tanggung jawab, dan hasil pekerjaan Anda." rows={5} className="w-full resize-y rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 py-3 text-sm leading-6 text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid="input-project-description" />
            </div>
            <div>
              <label htmlFor="project-url" className="mb-1.5 block text-xs font-bold">Tautan referensi <span className="font-normal text-sidebar-foreground/55">(opsional)</span></label>
              <input id="project-url" type="url" value={form.referenceUrl} onChange={(event) => setForm((current) => ({ ...current, referenceUrl: event.target.value }))} placeholder="https://" className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 py-3 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid="input-project-reference" />
              <span className="mt-1.5 block text-[11px] text-sidebar-foreground/55">Gunakan tautan yang boleh Anda bagikan.</span>
            </div>
            {formError && <p role="alert" className="rounded-lg bg-rose-200/10 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-200" data-testid="error-project-form">{formError}</p>}
            {(createEvidence.isError || updateEvidence.isError) && !formError && <p role="alert" className="text-xs font-semibold text-rose-200">Simpan belum berhasil. Coba kirim lagi.</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={pending} className="rounded-lg border border-sidebar-border px-4 py-2.5 text-sm font-bold hover:bg-sidebar-accent disabled:opacity-50" data-testid="button-save-project-draft">{pending ? 'Menyimpan…' : editable?.status === 'changes_requested' ? 'Simpan perubahan' : 'Simpan draft'}</button>
              <button type="submit" data-status="submitted" disabled={pending || !form.title.trim() || !form.description.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50" data-testid="button-submit-project">Ajukan verifikasi <ArrowRight size={15} /></button>
              {editingId && <button type="button" onClick={resetForm} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-sidebar-foreground/70 hover:bg-sidebar-accent" data-testid="button-cancel-project-edit">Batal</button>}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div><p className="eyebrow text-accent">Catatan tersimpan</p><h2 className="mt-1 text-2xl font-bold">Portofolio proyek</h2></div>
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">{projects.length} item</span>
          </div>
          {projects.length ? <div className="mt-4 divide-y divide-border">
            {projects.map((item) => {
              const canEdit = item.status === 'draft' || item.status === 'changes_requested';
              const submittedDate = item.submittedAt ? formatDate(item.submittedAt) : null;
              return <article key={item.id} className="py-5 first:pt-1 last:pb-1" data-testid={`card-project-${item.id}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyle(item.status)}`}>{item.status === 'verified' && <Check size={12} />}{statusLabel[item.status]}</span>
                      {submittedDate && <span className="text-[11px] text-muted-foreground">Diajukan {submittedDate}</span>}
                    </div>
                    <h3 className="mt-2.5 text-base font-bold">{item.title}</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.description}</p>
                    {item.referenceUrl && <a href={item.referenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline" data-testid={`link-project-reference-${item.id}`}>Buka tautan referensi <ExternalLink size={13} /></a>}
                    {item.status === 'submitted' && <p className="mt-3 text-xs text-muted-foreground">Detail dikunci selama proses peninjauan.</p>}
                    {item.status === 'verified' && item.verifiedAt && <p className="mt-3 text-xs text-muted-foreground">Terverifikasi {formatDate(item.verifiedAt)}.</p>}
                    {item.status === 'rejected' && <p className="mt-3 text-xs text-muted-foreground">Catatan ini bersifat baca-saja.</p>}
                  </div>
                  {canEdit && <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => editProject(item)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary" data-testid={`button-edit-project-${item.id}`}>Perbaiki</button>
                    {item.status === 'draft' && <button type="button" onClick={() => submitDraft(item)} disabled={updateEvidence.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-submit-project-${item.id}`}>{workingId === item.id ? 'Mengajukan…' : 'Ajukan'} <ArrowRight size={13} /></button>}
                  </div>}
                </div>
              </article>;
            })}
          </div> : <div className="grid min-h-64 place-items-center py-10 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><FolderKanban size={25} /></span>
              <h3 className="mt-4 text-lg font-bold">Portofolio dimulai dari satu pengalaman.</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Belum ada proyek tersimpan. Tambahkan pengalaman yang paling menggambarkan kontribusi Anda, lalu simpan sebagai draft atau ajukan untuk verifikasi.</p>
            </div>
          </div>}
        </section>
      </div>}
    </QueryState>
  </div>;
}
