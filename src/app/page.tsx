import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { createList } from "./lists/actions";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // No owner filter: RLS already limits this to lists the user owns or was
  // added to.
  const { data: lists, error } = await supabase
    .from("lists")
    .select("id, title, owner_id, items(done)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const mine = lists.filter((l) => l.owner_id === user.id);
  const shared = lists.filter((l) => l.owner_id !== user.id);

  return (
    <div className="space-y-10">
      <form action={createList} className="flex gap-2">
        <input
          name="title"
          required
          maxLength={80}
          placeholder="New list, e.g. Weekend groceries"
          aria-label="List title"
          className="input"
        />
        <button className="btn btn-primary shrink-0">Create list</button>
      </form>

      <ListSection title="Your lists" lists={mine} empty="You haven't made a list yet." />
      <ListSection title="Shared with you" lists={shared} empty="Nobody has shared a list with you yet." />
    </div>
  );
}

type ListSummary = { id: string; title: string; items: { done: boolean }[] };

function ListSection({ title, lists, empty }: { title: string; lists: ListSummary[]; empty: string }) {
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{title}</h2>
      {lists.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="card mt-3 divide-y divide-border">
          {lists.map((list) => {
            const done = list.items.filter((i) => i.done).length;
            return (
              <li key={list.id}>
                <Link href={`/lists/${list.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-border/40">
                  <span className="font-medium">{list.title}</span>
                  <span className="text-sm text-muted">
                    {list.items.length === 0 ? "empty" : `${done}/${list.items.length} done`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
