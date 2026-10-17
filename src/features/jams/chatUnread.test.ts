import { describe, expect, it } from "vitest";
import { createChatUnreadStore } from "./chatUnread";

describe("chat unread store", () => {
  it("counts other people's messages while the chat is closed", () => {
    const store = createChatUnreadStore();
    expect(store.received("j", "them", "me")).toBe(true);
    expect(store.received("j", "them", "me")).toBe(true);
    expect(store.get().unread.j).toBe(2);
  });

  it("ignores my own messages and messages while the chat is open", () => {
    const store = createChatUnreadStore();
    expect(store.received("j", "me", "me")).toBe(false);
    store.opened("j");
    expect(store.received("j", "them", "me")).toBe(false);
    expect(store.get().unread.j).toBe(0);
  });

  it("opening clears the count; closing resumes counting", () => {
    const store = createChatUnreadStore();
    store.received("j", "them", "me");
    store.opened("j");
    expect(store.get().unread.j).toBe(0);
    store.closed("j");
    expect(store.received("j", "them", "me")).toBe(true);
  });
});
