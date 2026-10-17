import { useCallback, useEffect, useState } from "react";
import type { TrustedContactRow } from "@/lib/types";
import { deleteContact, listContacts, saveContact } from "./api";
import type { ContactInput } from "./schema";

type State = { contacts: TrustedContactRow[]; loading: boolean; error: string | null };

export function useTrustedContacts() {
  const [state, setState] = useState<State>({ contacts: [], loading: true, error: null });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await listContacts();
    setState((s) => (error ? { ...s, loading: false, error } : { contacts: data ?? [], loading: false, error: null }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    listContacts().then(({ data, error }) => {
      if (cancelled) return;
      setState(error ? { contacts: [], loading: false, error } : { contacts: data ?? [], loading: false, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Returns an error message, or null on success. */
  const save = useCallback(async (input: ContactInput, id?: string): Promise<string | null> => {
    const { data, error } = await saveContact(input, id);
    if (error || !data) return error ?? "Couldn't save.";
    setState((s) => ({
      ...s,
      contacts: id ? s.contacts.map((c) => (c.id === id ? data : c)) : [...s.contacts, data],
    }));
    return null;
  }, []);

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await deleteContact(id);
    if (error) return error;
    setState((s) => ({ ...s, contacts: s.contacts.filter((c) => c.id !== id) }));
    return null;
  }, []);

  return { ...state, reload, save, remove };
}
