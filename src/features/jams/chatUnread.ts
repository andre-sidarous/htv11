import { useSyncExternalStore } from "react";

/**
 * Unread chat counts per Jam, and which Jam's chat is on screen right now. Pure (no react-native),
 * so it's unit-tested. ChatBanner feeds it new messages; ChatScreen marks a Jam's chat as open.
 */

type State = { unread: Record<string, number>; openJamId: string | null };

export function createChatUnreadStore() {
  let state: State = { unread: {}, openJamId: null };
  const listeners = new Set<() => void>();
  const set = (next: State) => {
    state = next;
    listeners.forEach((l) => l());
  };

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** A new message arrived. Returns true when the person should be told (not theirs, chat not open). */
    received(jamId: string, fromUserId: string, myUserId: string | null | undefined): boolean {
      if (!myUserId || fromUserId === myUserId || state.openJamId === jamId) return false;
      set({ ...state, unread: { ...state.unread, [jamId]: (state.unread[jamId] ?? 0) + 1 } });
      return true;
    },
    opened(jamId: string) {
      set({ openJamId: jamId, unread: { ...state.unread, [jamId]: 0 } });
    },
    closed(jamId: string) {
      if (state.openJamId === jamId) set({ ...state, openJamId: null });
    },
  };
}

export const chatUnread = createChatUnreadStore();

export function useChatUnread(jamId: string | undefined): number {
  return useSyncExternalStore(
    chatUnread.subscribe,
    () => (jamId ? (chatUnread.get().unread[jamId] ?? 0) : 0),
    () => 0,
  );
}
