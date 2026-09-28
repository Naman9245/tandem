"use server";

// Every action here talks to Supabase as the signed-in user. None of them
// check permissions themselves: if the user isn't allowed to do something,
// RLS either rejects the write or it matches zero rows.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function createList(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const supabase = await createClient();
  const { data, error } = await supabase.from("lists").insert({ title }).select("id").single();
  if (error) throw new Error(error.message);

  redirect(`/lists/${data.id}`);
}

export async function deleteList(listId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("lists").delete().eq("id", listId);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  redirect("/");
}

export async function addItem(listId: string, formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  const supabase = await createClient();
  const { error } = await supabase.from("items").insert({ list_id: listId, content });
  if (error) throw new Error(error.message);

  revalidatePath(`/lists/${listId}`);
}

export async function setItemDone(listId: string, itemId: string, done: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("items").update({ done }).eq("id", itemId);
  if (error) throw new Error(error.message);

  revalidatePath(`/lists/${listId}`);
}

export async function deleteItem(listId: string, itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);

  revalidatePath(`/lists/${listId}`);
}

export type InviteState = { error?: string; message?: string };

// Sharing goes through the invite-member edge function; see
// supabase/functions/invite-member/index.ts for why it can't be a plain insert.
export async function inviteMember(listId: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email address." };

  const supabase = await createClient();
  const { error } = await supabase.functions.invoke("invite-member", {
    body: { list_id: listId, email },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      return { error: body?.error ?? "Couldn't share the list." };
    }
    return { error: "Couldn't reach the invite service." };
  }

  revalidatePath(`/lists/${listId}`);
  return { message: `Shared with ${email}. If they're new to Tandem, they'll get an invite email.` };
}

// Owners use this to remove someone; members use it on themselves to leave.
export async function removeMember(listId: string, userId: string) {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.from("list_members").delete().eq("list_id", listId).eq("user_id", userId);
  if (error) throw new Error(error.message);

  if (user?.id === userId) {
    revalidatePath("/");
    redirect("/");
  }
  revalidatePath(`/lists/${listId}`);
}
