export interface ParsedClient {
  name: string;
  email: string;
  location: string;
  contact_person: string;
  contact_person_phone: string;
  contact_person_email: string;
  contact_person_role: string;
  category: string;
  mode_of_connection: string;
  product: string;
  interest_scale: number;
}

export function parseCsv(text: string): ParsedClient[] {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const results: ParsedClient[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

    results.push({
      name: row.name || row.client_name || row.company || "",
      email: row.email || "",
      location: row.location || row.address || "",
      contact_person: row.contact_person || row.contact || row.person || "",
      contact_person_phone: row.contact_person_phone || row.phone || row.contact_phone || "",
      contact_person_email: row.contact_person_email || row.contact_email || "",
      contact_person_role: row.contact_person_role || row.role || row.title || "",
      category: row.category || row.type || "",
      mode_of_connection: row.mode_of_connection || row.mode || row.connection || "",
      product: row.product || row.product_name || "",
      interest_scale: parseFloat(row.interest_scale || row.interest || "5") || 5,
    });
  }

  return results;
}