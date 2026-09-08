"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { MapPin } from "@/components/ui/icons";

const CONSENT_KEY = "folio:google-maps-consent";
const CONSENT_EVENT = "folio:google-maps-consent-change";

function hasSavedConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "allowed";
  } catch {
    return false;
  }
}

function subscribeToConsent(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === CONSENT_KEY || event.key === null) onChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CONSENT_EVENT, onChange);
  };
}

export function CustomerAddressMap({ address }: { address: string }) {
  const alwaysAllow = useSyncExternalStore(
    subscribeToConsent,
    hasSavedConsent,
    () => false,
  );
  const [allowedOnce, setAllowedOnce] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const allowed = allowedOnce || alwaysAllow;

  function allow(always: boolean) {
    setMessage(null);
    if (!always) {
      setAllowedOnce(true);
      return;
    }

    try {
      window.localStorage.setItem(CONSENT_KEY, "allowed");
      window.dispatchEvent(new Event(CONSENT_EVENT));
      setAllowedOnce(false);
    } catch {
      setAllowedOnce(true);
      setMessage("Your browser could not save this preference. The map is allowed for this visit only.");
    }
  }

  return (
    <div className="mt-4">
      {allowed ? (
        <iframe
          className="block h-64 w-full rounded-xl border border-border bg-surface-subtle"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={`https://www.google.com/maps?${new URLSearchParams({ q: address, output: "embed" })}`}
          title="Customer billing address on Google Maps"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <MapPin aria-hidden="true" className="size-4" />
            View address on a map
          </div>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            Loading this map shares the customer&apos;s billing address and your IP
            address with Google. Google may also use cookies. Nothing is sent to
            Google Maps until you allow it.
          </p>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            “Always allow” applies to all customer maps in this browser.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="text-[12px]" onClick={() => allow(false)} type="button" variant="outline">
              Allow once
            </Button>
            <Button className="text-[12px]" onClick={() => allow(true)} type="button" variant="outline">
              Always allow
            </Button>
          </div>
        </div>
      )}
      {message ? (
        <p className="px-3 py-2 text-[12px] leading-5 text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
