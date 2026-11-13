import Link from "next/link";
import { deleteCustomerAction, saveCustomerAction } from "@/app/actions";
import { can } from "@/server/core";
import { listCustomers } from "@/server/quotes";
import { requireCtx } from "@/server/session";
import { Empty, Field, PageHead } from "@/ui/bits";
import { ActionForm, Submit } from "@/ui/Form";

export const metadata = { title: "Müşteriler" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { ctx, info } = await requireCtx();
  const [rows, { m }] = await Promise.all([listCustomers(ctx), searchParams]);
  const editing = rows.find((r) => r.id === m);
  const canWrite = can(info.role, "write");
  return (
    <>
      <PageHead title="Müşteriler" sub="Teklif verdiğiniz firmalar. E-postası kayıtlı müşteriye teklif bağlantısı otomatik gönderilir." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {rows.length ? (
          <div className="panel overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Ad</th><th>E-posta</th><th>Telefon</th><th>Teklif</th><th><span className="sr-only">İşlem</span></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-ink-2">{c.email}</td>
                    <td className="text-ink-2">{c.phone}</td>
                    <td className="num">{c.quoteCount}</td>
                    <td className="text-right">{canWrite && <Link className="link" href={`/panel/musteriler?m=${c.id}`} aria-label={`${c.name} kaydını düzenle`}>Düzenle</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Henüz müşteri yok"><p>İlk müşterinizi yandaki formdan ekleyin. Portaldan gelen talepler iletişim bilgileriyle birlikte tekliflere düşer.</p></Empty>
        )}

        {canWrite && (
          <section className="panel p-5" aria-labelledby="musteri-form">
            <h2 id="musteri-form" className="text-[1.3rem]">{editing ? "Müşteriyi düzenle" : "Yeni müşteri"}</h2>
            <ActionForm key={editing?.id ?? "new"} action={saveCustomerAction} resetOnOk={!editing} className="mt-4 grid gap-3">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Firma veya kişi adı" name="name" defaultValue={editing?.name} required minLength={2} />
              <Field label="E-posta" name="email" type="email" defaultValue={editing?.email ?? ""} />
              <Field label="Telefon" name="phone" type="tel" defaultValue={editing?.phone ?? ""} />
              <Field label="Vergi no" name="taxNo" defaultValue={editing?.taxNo ?? ""} />
              <label><span className="label">Not</span><textarea name="note" defaultValue={editing?.note ?? ""} maxLength={1000} className="input" /></label>
              <div className="flex items-center gap-3"><Submit>{editing ? "Kaydet" : "Müşteri ekle"}</Submit>{editing && <Link className="link" href="/panel/musteriler">Vazgeç</Link>}</div>
            </ActionForm>
            {editing && (
              <ActionForm action={deleteCustomerAction.bind(null, editing.id)} confirm={`${editing.name} silinsin mi? Teklifleri silinmez, müşteri bağlantısı kaldırılır.`} className="mt-4 border-t border-line pt-4">
                <Submit className="btn btn-danger btn-sm">Müşteriyi sil</Submit>
              </ActionForm>
            )}
          </section>
        )}
      </div>
    </>
  );
}
