"use client";

import { useActionState, useState, useTransition } from "react";

import { InlineNotice } from "@/components/auth/inline-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { createMcpTokenAction, revokeMcpTokenAction, type McpTokenFormState } from "./actions";
import type { McpTokenSummary } from "./tokens";

function CreatedToken({ token }: { token: string }) {
  const [hidden, setHidden] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  if (hidden) return null;

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopyStatus("Token copied.");
    } catch {
      setCopyStatus("Select and copy the token below.");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm font-medium" role="status">Save your new token. It will not be shown again.</p>
      <Input
        aria-label="New MCP access token"
        autoComplete="off"
        className="font-mono text-xs"
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        spellCheck={false}
        value={token}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={copyToken} type="button" variant="secondary">Copy token</Button>
        <Button onClick={() => setHidden(true)} type="button" variant="ghost">I have saved it</Button>
        <span className="text-xs text-muted-foreground" role="status">{copyStatus}</span>
      </div>
    </div>
  );
}

function RevokeToken({ token }: { token: McpTokenSummary }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="space-y-1">
      <Button
        aria-label={`Revoke ${token.label}`}
        disabled={pending}
        onClick={() => startTransition(async () => {
          setError("");
          try {
            await revokeMcpTokenAction(token.id);
          } catch {
            setError("Could not revoke this token. Try again.");
          }
        })}
        size="sm"
        type="button"
        variant="destructive"
      >
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

export function McpTokenControls({ tokens, now }: { tokens: McpTokenSummary[]; now: string }) {
  const [state, formAction, pending] = useActionState<McpTokenFormState, FormData>(createMcpTokenAction, {});

  return (
    <div className="space-y-5">
      <form action={formAction} aria-busy={pending} className="space-y-4">
        {state.error ? <InlineNotice tone="error">{state.error}</InlineNotice> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="mcp-label">Connection name</Label>
            <Input id="mcp-label" maxLength={80} name="label" placeholder="My assistant" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-access">Access</Label>
            <Select defaultValue="read" name="access" required>
              <SelectTrigger className="w-full" id="mcp-access"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read only</SelectItem>
                <SelectItem value="write">Read and write</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-expiry">Expires after</Label>
            <Select defaultValue="30" name="expiryDays" required>
              <SelectTrigger className="w-full" id="mcp-expiry"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">{pending ? "Creating…" : "Create access token"}</Button>
        </div>
      </form>

      {state.created ? <CreatedToken key={state.created.id} token={state.created.token} /> : null}

      {tokens.length ? (
        <ul aria-label="MCP connections" className="divide-y divide-border">
          {tokens.map((token) => {
            const expired = token.expires_at <= now;
            const status = token.revoked_at ? "Revoked" : expired ? "Expired" : "Active";
            return (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={token.id}>
                <div className="min-w-0 space-y-1">
                  <p className="break-words text-sm font-medium">{token.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {status} · {token.access === "write" ? "Read and write" : "Read only"} · Expires {token.expires_at.slice(0, 10)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <code>{token.token_prefix}…</code> · Created {token.created_at.slice(0, 10)}
                  </p>
                </div>
                {!token.revoked_at && !expired ? <RevokeToken token={token} /> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No connections yet.</p>}
    </div>
  );
}
