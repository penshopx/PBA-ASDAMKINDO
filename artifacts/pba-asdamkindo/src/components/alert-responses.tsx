import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminAlertResponsesQueryKey,
  useListAdminAlertResponses,
  useAcknowledgeAdminAlert,
  useResolveAdminAlert,
} from "@workspace/api-client-react";
import { useState } from "react";

const labels = {
  awaiting_ack: "Menunggu konfirmasi",
  overdue: "Terlambat — belum dikonfirmasi",
  acknowledged: "Sudah dikonfirmasi",
  acknowledged_late: "Dikonfirmasi setelah tenggat",
};

const reminderLabels = {
  not_sent: "Belum ada pengingat terkirim",
  pending: "Pengingat sedang dikirim",
  delivered: "Pengingat Slack terkirim",
  failed: "Pengiriman pengingat gagal",
  interrupted: "Pengiriman terhenti; tidak dikirim ulang otomatis",
  stopped: "Pengingat dihentikan setelah ACK",
};

const deliveryLabels = {
  unknown: "Belum tercatat",
  pending: "Sedang dikirim",
  delivered: "Terkirim",
  failed: "Gagal",
  disabled: "Kanal tidak aktif",
};

export function AlertResponses() {
  const client = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const query = useListAdminAlertResponses({
    query: { queryKey: getListAdminAlertResponsesQueryKey(), refetchInterval: 15_000, retry: false },
  });
  const acknowledge = useAcknowledgeAdminAlert({
    mutation: {
      onSuccess: () => {
        setFeedback("Konfirmasi tercatat. ACK bukan berarti gangguan sudah selesai.");
        return client.invalidateQueries({ queryKey: getListAdminAlertResponsesQueryKey() });
      },
      onError: () => setFeedback("Konfirmasi belum tersimpan. Coba lagi; jangan anggap alarm sudah ditangani."),
    },
  });
  const resolve = useResolveAdminAlert({
    mutation: {
      onSuccess: () => {
        setFeedback("Insiden ditandai selesai. Status delivery dan ACK tetap tersimpan terpisah.");
        return client.invalidateQueries({ queryKey: getListAdminAlertResponsesQueryKey() });
      },
      onError: () => setFeedback("Penyelesaian belum tersimpan. Status delivery dan ACK tidak diubah."),
    },
  });
  return <section className="mt-6 border-t border-border pt-5" aria-label="Status alarm dan penyelesaian insiden">
    <h3 className="text-lg font-bold">Respons alarm dan penyelesaian insiden</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      Tenggat awal 15 menit sejak alarm dipicu, dapat dikonfigurasi oleh operator.
      Delivery alarm, ACK petugas, dan penyelesaian insiden adalah status terpisah.
      Menandai selesai tidak mengirim notifikasi baru.
    </p>
    {query.isLoading && <p className="mt-3" role="status">Memuat respons alarm…</p>}
    {query.isError && <p className="mt-3 text-destructive" role="alert">
      Respons alarm tidak dapat dimuat.
      <button className="ml-2 underline" onClick={() => query.refetch()}>Coba lagi</button>
    </p>}
    {query.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">
      Belum ada alarm tercatat sejak fitur respons alarm diaktifkan.
    </p>}
    <ul className="mt-4 space-y-3">
      {query.data?.map(record => <li key={record.id} className="rounded-lg border border-border p-3 text-sm">
        <strong>{record.alertName}</strong>
        <div className="mt-2 grid gap-2 rounded-md bg-muted/40 p-3 text-xs sm:grid-cols-3">
          <p><strong>Delivery alarm:</strong> {deliveryLabels[record.deliveryStatus]}</p>
          <p><strong>ACK:</strong> {labels[record.responseStatus]}</p>
          <p><strong>Penyelesaian:</strong> {record.incidentStatus === "resolved" ? "Selesai" : "Belum selesai"}</p>
        </div>
        {record.overdueAt && <p className="mt-1 text-xs text-muted-foreground">
          Status pengingat: {reminderLabels[record.reminderStatus]} · {record.reminderAttempts} percobaan
          {record.reminderExhausted ? " · batas percobaan tercapai" : ""}
        </p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Tenggat: {new Date(record.responseDueAt).toLocaleString("id-ID")}
        </p>
        {record.acknowledgedAt
          ? <p className="text-xs text-muted-foreground">Dikonfirmasi: {new Date(record.acknowledgedAt).toLocaleString("id-ID")}</p>
          : <button
              className="mt-3 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              disabled={acknowledge.isPending}
              data-testid="button-alert-ack"
              onClick={() => { setFeedback(""); acknowledge.mutate({ id: record.id }); }}
            >{acknowledge.isPending && acknowledge.variables?.id === record.id ? "Menyimpan…" : "Saya menerima alarm (ACK)"}</button>}
        {record.incidentStatus === "resolved"
          ? <p className="mt-2 text-xs text-muted-foreground">
              Selesai: {record.resolvedAt ? new Date(record.resolvedAt).toLocaleString("id-ID") : "—"}
              {record.resolvedBy ? ` · oleh ${record.resolvedBy}` : ""}
            </p>
          : record.acknowledgedAt
            ? <button
                className="mt-3 ml-2 rounded-lg border border-primary px-4 py-2 font-bold text-primary disabled:opacity-50"
                disabled={resolve.isPending}
                data-testid="button-alert-resolve"
                onClick={() => { setFeedback(""); resolve.mutate({ id: record.id }); }}
              >{resolve.isPending && resolve.variables?.id === record.id ? "Menyimpan…" : "Tandai insiden selesai"}</button>
            : <p className="mt-2 text-xs text-muted-foreground">
                Konfirmasi ACK diperlukan sebelum menandai insiden selesai.
              </p>}
        {record.overdueAt && <p className="mt-1 text-xs text-destructive">
          Tenggat awal tetap tercatat. Pengiriman pengingat, ACK penerimaan, dan penyelesaian insiden adalah status terpisah.
        </p>}
      </li>)}
    </ul>
    {feedback && <p className="mt-3 text-sm" role="status">{feedback}</p>}
  </section>;
}
