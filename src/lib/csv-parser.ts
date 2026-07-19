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
  stage: number;
  stage_notes: string;
}

/**
 * Parse a CSV string into structured client rows.
 * Handles flexible column names (e.g. "phone" → contact_person_phone).
 * Quoted fields (RFC 4180) are supported.
 */
export function parseCsv(text: string): ParsedClient[] {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const results: ParsedClient[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").trim(); });

    results.push({
      name: row.name || row.client_name || row.company || row.organisation || row.organization || "",
      email: row.email || row.client_email || "",
      location: row.location || row.address || row.city || row.region || "",
      contact_person: row.contact_person || row.contact || row.person || row.rep || "",
      contact_person_phone: row.contact_person_phone || row.phone || row.contact_phone || row.mobile || row.tel || "",
      contact_person_email: row.contact_person_email || row.contact_email || "",
      contact_person_role: row.contact_person_role || row.role || row.title || row.position || "",
      category: row.category || row.type || row.industry || row.sector || "",
      mode_of_connection: row.mode_of_connection || row.mode || row.connection || row.channel || row.source || "",
      product: row.product || row.product_name || row.service || row.offering || "",
      interest_scale: clampInterest(parseFloat(row.interest_scale || row.interest || row.score || "5")),
      stage: parseInt(row.stage || row.stage_number || "1", 10) || 1,
      stage_notes: row.stage_notes || row.notes || row.description || row.status || row.remarks || "",
    });
  }

  return results;
}

/** Split a single CSV line respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function clampInterest(n: number): number {
  if (isNaN(n)) return 5;
  return Math.min(10, Math.max(1, n));
}

/** CSV template the user can download as a starting point. */
export const CSV_TEMPLATE_HEADERS =
  "name,email,location,contact_person,contact_person_phone,contact_person_email,contact_person_role,category,mode_of_connection,product,interest_scale,stage,stage_notes";

export const CSV_TEMPLATE_EXAMPLE =
  `${CSV_TEMPLATE_HEADERS}
Acme Corp,hello@acme.com,Nairobi,Jane Doe,0712345678,jane@acme.com,CEO,Technology,Referral,Software License,7,1,Met at conference — interested in the enterprise plan
Blue Sky Ltd,,Mombasa,,,,,Consulting,WhatsApp,Consulting Package,5,1,Reached out via WhatsApp asking about pricing`;