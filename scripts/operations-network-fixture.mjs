if (process.env.DEVUP_OPERATIONS_FIXTURE !== "enabled")
  throw new Error("Operations fixture requires explicit test activation");
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url,
  );
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("No external HTTP traffic from the operations test server");
  return originalFetch(input, init);
};
