"use client";

import { useEffect, useState } from "react";

export default function ManualPreparationForm() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <form
      action="/api/admin/operations"
      method="post"
      onSubmit={() => setPending(true)}
      aria-busy={pending}
    >
      <input type="hidden" name="mode" value="prepare" />
      <button
        className="admin-button admin-button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Preparing today's draft…" : "Prepare today's draft"}
      </button>
      <p role="status" className={pending ? "admin-help mt-2" : "sr-only"}>
        {pending
          ? "Fetching sources and writing the draft. Please keep this page open; this can take a few minutes."
          : null}
      </p>
    </form>
  );
}
