"use client";

import { type ReactNode, createContext, startTransition, useActionState, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { State } from "@/server/session";

type Action = (prev: State, fd: FormData) => Promise<State>;
const Pending = createContext(false);

// A bulk action changes fields that other forms on the page are showing. Uncontrolled inputs and selects keep what they
// display (and an auto-saving form would then write the old values back), so those forms remount when this counter moves.
let epoch = 0;
const epochSubs = new Set<() => void>();
const subscribeEpoch = (cb: () => void) => { epochSubs.add(cb); return () => { epochSubs.delete(cb); }; };

/**
 * A form bound to a server action. Shows the action's error or success message under the fields.
 * Submitting through onSubmit keeps what the user typed when the action fails (a plain `action` form resets itself);
 * the `action` attribute stays as the no-JavaScript fallback.
 * `auto` saves shortly after any field changes; `confirm` asks before submitting.
 * `bulk` marks an action that edits rows shown by other forms; forms marked `synced` reload their fields after it succeeds.
 */
export function ActionForm({ action, children, className, auto, resetOnOk, confirm, bulk, synced }: {
  action: Action; children: ReactNode; className?: string; auto?: boolean; resetOnOk?: boolean; confirm?: string; bulk?: boolean; synced?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seen = useSyncExternalStore(subscribeEpoch, () => epoch, () => 0);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!state || state.error) return;
    if (resetOnOk) form.current?.reset();
    if (bulk) { epoch++; epochSubs.forEach((cb) => cb()); }
  }, [state, resetOnOk, bulk]);
  // payment provider's hosted checkout: the snippet it returns must be executed to render its card form
  useEffect(() => {
    if (!state?.html) return;
    const tpl = document.createElement("template");
    tpl.innerHTML = state.html;
    for (const old of tpl.content.querySelectorAll("script")) {
      const el = document.createElement("script");
      if (old.src) el.src = old.src; else el.textContent = old.textContent;
      document.body.appendChild(el);
    }
  }, [state?.html]);

  return (
    <form
      key={synced ? seen : undefined} ref={form} action={dispatch} className={className} aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => dispatch(fd));
      }}
      onChange={auto ? () => { clearTimeout(timer.current); timer.current = setTimeout(() => form.current?.requestSubmit(), 600); } : undefined}
    >
      <Pending.Provider value={pending}>{children}</Pending.Provider>
      {state?.error && <p role="alert" className="note note-danger col-span-full mt-3">{state.error}</p>}
      {state?.ok && (
        <p role="status" className="note note-ok col-span-full mt-3">
          {state.ok}
          {state.url && <span className="mt-1 block text-ink-2">E-posta gönderilmedi. Bağlantı: <a className="link break-all" href={state.url}>{state.url}</a></span>}
        </p>
      )}
      {state?.html && <div id="iyzipay-checkout-form" className="responsive mt-4" />}
    </form>
  );
}

export function Submit({ children, className = "btn btn-primary", name, value }: { children: ReactNode; className?: string; name?: string; value?: string }) {
  const pending = useContext(Pending);
  return <button type="submit" className={className} disabled={pending} name={name} value={value}>{children}</button>;
}
