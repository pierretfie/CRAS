/**
 * Call a server function via Fly middleware when VITE_API_URL is set.
 * Falls back to local handler if no remote URL or on server.
 */
export async function callViaProxy<T>(fn: string, data: unknown): Promise<T> {
  const apiUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (apiUrl && typeof window !== "undefined") {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fn, data }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Proxy ${fn} failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
  throw new Error("No remote URL — call local handler");
}

export async function callRemote<T>(path: string, data: unknown): Promise<T> {
  const apiUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (apiUrl && typeof window !== "undefined") {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
  throw new Error("No remote URL — call local handler");
}
