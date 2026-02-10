const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY;
const SHEET_ID = import.meta.env.VITE_GOOGLE_SHEET_ID;

const sheetsEnabled = API_KEY && SHEET_ID && !API_KEY.includes('your_google');

// Weekly tab names in order (matching the spreadsheet)
const WEEKLY_TABS = [
  '1110-1116', '1117-1123', '1124-1130', '121-127', '128-1214',
  '1215-1221', '1222-1228', '1229-14', '15-111', '112-118',
  '119-125', '126-21', '22-28', '29-215',
];

async function fetchSheet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  return json.values || [];
}

// Convert Excel serial date to YYYY-MM-DD
function serialToDate(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel epoch is Jan 0, 1900 (with the 1900 leap year bug)
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Fetch all weekly tabs and flatten into daily entries ───
export async function fetchSheetsDaily() {
  if (!sheetsEnabled) return [];

  const allEntries = [];

  for (const tab of WEEKLY_TABS) {
    try {
      // Rows 2-8 are the daily data (row 1 = headers, row 9 = totals)
      const rows = await fetchSheet(`'${tab}'!A2:M8`);
      for (const row of rows) {
        const dateVal = row[0];
        if (!dateVal) continue;
        
        const date = serialToDate(dateVal);
        if (!date) continue;

        const hours = parseFloat(row[1]) || 0;
        const calls = parseInt(row[2]) || 0;
        // Skip col D (formula)
        const pickups = parseInt(row[4]) || 0;
        const pledges = parseInt(row[5]) || 0;
        const followUps = parseInt(row[6]) || 0;
        const followUpsComplete = parseInt(row[7]) || 0;
        const raised = parseFloat(row[8]) || 0;
        const pledged = parseFloat(row[9]) || 0;
        // Skip cols K, L (formulas)
        const list = row[12] || '';

        // Skip zero-activity days
        if (hours === 0 && calls === 0) continue;

        allEntries.push({
          date, hours, calls, pickups, pledges, followUps, followUpsComplete,
          raised, pledged, list, source: 'sheets',
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch tab ${tab}:`, err.message);
    }
  }

  return allEntries;
}

// ─── Fetch the Call Back List tab ───
export async function fetchSheetsCallbacks() {
  if (!sheetsEnabled) return [];

  try {
    const rows = await fetchSheet("'Call Back List'!A2:F100");
    return rows
      .filter(row => row[1]) // must have a name
      .map((row, i) => {
        let recorded = '';
        if (typeof row[0] === 'number') {
          recorded = serialToDate(row[0]) || '';
        } else if (row[0]) {
          recorded = String(row[0]);
        }

        let callbackOn = '';
        if (typeof row[2] === 'number') {
          callbackOn = serialToDate(row[2]) || '';
        } else if (row[2]) {
          callbackOn = String(row[2]);
        }

        return {
          id: `sheets-${i}`,
          recorded,
          name: String(row[1] || ''),
          callbackOn,
          callMade: row[3] === true || row[3] === 'TRUE' || row[3] === 1,
          notes: String(row[4] || ''),
          source: 'sheets',
        };
      });
  } catch (err) {
    console.warn('Failed to fetch callbacks from Sheets:', err.message);
    return [];
  }
}

export { sheetsEnabled };
