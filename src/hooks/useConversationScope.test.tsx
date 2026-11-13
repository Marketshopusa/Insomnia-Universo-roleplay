import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useConversationScope } from "./useConversationScope";

it("rejects an old card response even if the user visits that card again", () => {
  const { result, rerender } = renderHook(({ card }) => useConversationScope(card), { initialProps: { card: "a" } });
  const first = result.current.capture();
  rerender({ card: "b" });
  expect(result.current.isCurrent(first)).toBe(false);
  rerender({ card: "a" });
  expect(result.current.isCurrent(first)).toBe(false);
  expect(result.current.isCurrent(result.current.capture())).toBe(true);
});

it("rejects pending work after a reset, account change, and unmount", () => {
  const { result, rerender, unmount } = renderHook(({ account }) => useConversationScope(`${account}:a`), { initialProps: { account: "one" } });
  const beforeReset = result.current.capture();
  act(() => result.current.invalidate());
  expect(result.current.isCurrent(beforeReset)).toBe(false);
  const beforeAccountChange = result.current.capture();
  rerender({ account: "two" });
  expect(result.current.isCurrent(beforeAccountChange)).toBe(false);
  const beforeUnmount = result.current.capture();
  unmount();
  expect(result.current.isCurrent(beforeUnmount)).toBe(false);
});
