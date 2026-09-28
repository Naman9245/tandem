import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { addItem, deleteItem, deleteList, inviteMember, removeMember, setItemDone } from "../actions";
import { ConfirmButton } from "./confirm-button";
import { InviteForm } from "./invite-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ListPage({ params }: PageProps<"/lists/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [listRes, itemsRes, membersRes] = await Promise.all([
    supabase.from("lists").select("id, title, owner_id").eq("id", id).maybeSingle(),
    supabase.from("items").select("id, content, done, created_by").eq("list_id", id).order("created_at"),
    supabase.from("list_members").select("user_id, email").eq("list_id", id).order("added_at"),
  ]);
  for (const res of [listRes, itemsRes, membersRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  // Someone else's list is invisible under RLS, so it's a 404 rather than a 403.
  const list = listRes.data;
  if (!list) notFound();
  const items = itemsRes.data ?? [];
  const members = membersRes.data ?? [];
  const isOwner = list.owner_id === user.id;
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← All lists
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{list.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {items.length === 0 ? "No items yet" : `${doneCount} of ${items.length} done`}
              {!isOwner && " · shared with you"}
            </p>
          </div>
          {isOwner ? (
            <ConfirmButton
              action={deleteList.bind(null, list.id)}
              confirmMessage={`Delete "${list.title}" and all its items?`}
              className="btn btn-danger shrink-0"
            >
              Delete list
            </ConfirmButton>
          ) : (
            <ConfirmButton
              action={removeMember.bind(null, list.id, user.id)}
              confirmMessage={`Leave "${list.title}"? You'll lose access until the owner adds you again.`}
              className="btn shrink-0"
            >
              Leave list
            </ConfirmButton>
          )}
        </div>
      </div>

      <section className="card">
        {items.length > 0 && (
          <ul className="divide-y divide-border border-b border-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <form action={setItemDone.bind(null, list.id, item.id, !item.done)}>
                  <button
                    aria-label={item.done ? `Mark "${item.content}" as not done` : `Mark "${item.content}" as done`}
                    className={`flex size-5 items-center justify-center rounded border text-xs ${
                      item.done ? "border-accent bg-accent text-accent-foreground" : "border-muted hover:border-accent"
                    }`}
                  >
                    {item.done && "✓"}
                  </button>
                </form>
                <span className={`flex-1 text-sm ${item.done ? "text-muted line-through" : ""}`}>{item.content}</span>
                {(isOwner || item.created_by === user.id) && (
                  <form action={deleteItem.bind(null, list.id, item.id)}>
                    <button aria-label={`Delete "${item.content}"`} className="px-1 text-muted hover:text-danger">
                      ×
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={addItem.bind(null, list.id)} className="flex gap-2 p-3">
          <input name="content" required maxLength={280} placeholder="Add an item" aria-label="New item" className="input" />
          <button className="btn btn-primary shrink-0">Add</button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">People</h2>
        <ul className="card mt-3 divide-y divide-border text-sm">
          <li className="flex items-center justify-between px-4 py-2.5">
            <span>{isOwner ? `${user.email} (you)` : "The owner"}</span>
            <span className="text-muted">owner</span>
          </li>
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between px-4 py-2.5">
              <span>
                {m.email}
                {m.user_id === user.id && " (you)"}
              </span>
              {isOwner ? (
                <form action={removeMember.bind(null, list.id, m.user_id)}>
                  <button className="text-muted hover:text-danger">Remove</button>
                </form>
              ) : (
                <span className="text-muted">member</span>
              )}
            </li>
          ))}
        </ul>
        {isOwner && <InviteForm action={inviteMember.bind(null, list.id)} />}
      </section>
    </div>
  );
}
