import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AlternanceData {
	/** 'YYYY-MM-DD' → hex color '#RRGGBB' */
	days: Record<string, string>;
	contractStart: Date | null;
	contractEnd: Date | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function excelSerialToDate(serial: number): Date {
	// Excel stores dates as days since 1900-01-01 (with Lotus 1-2-3 bug: 1900 treated as leap year)
	const utcDays = Math.floor(serial - 25569);
	return new Date(utcDays * 86400 * 1000);
}

function extractCellColor(cell: XLSX.CellObject | undefined): string | null {
	if (!cell?.s) return null;

	// SheetJS stores fill in s.fgColor for solid pattern fills
	const fgColor = (cell.s as Record<string, unknown>).fgColor as
		{ rgb?: string; theme?: number; indexed?: number } | undefined;

	if (!fgColor?.rgb) return null;

	// Format is AARRGGBB (8 chars) or RRGGBB (6 chars)
	const hex = fgColor.rgb.length === 8 ? fgColor.rgb.slice(2) : fgColor.rgb;

	// Skip white and black (no-fill defaults)
	const upper = hex.toUpperCase();
	if (upper === 'FFFFFF' || upper === '000000') return null;

	return '#' + hex.toUpperCase();
}

function parseCellDate(cell: XLSX.CellObject | undefined): Date | null {
	if (!cell) return null;

	if (cell.v instanceof Date) return cell.v;

	if (typeof cell.v === 'number') return excelSerialToDate(cell.v);

	if (typeof cell.v === 'string') {
		const s = cell.v.trim();

		// French format: DD/MM/YYYY or DD-MM-YYYY
		const frMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
		if (frMatch) {
			const d = new Date(
				parseInt(frMatch[3], 10),
				parseInt(frMatch[2], 10) - 1,
				parseInt(frMatch[1], 10),
			);
			if (!isNaN(d.getTime())) return d;
		}

		// ISO or other formats as fallback
		const d = new Date(s);
		if (!isNaN(d.getTime())) return d;
	}

	return null;
}

// ── Main parser ────────────────────────────────────────────────────────────

export async function parseAlternanceXlsx(file: File): Promise<AlternanceData> {
	const buffer = await file.arrayBuffer();
	const wb = XLSX.read(buffer, { cellStyles: true, cellDates: true });

	const days: Record<string, string> = {};
	let contractStart: Date | null = null;
	let contractEnd: Date | null = null;

	for (const sheetName of wb.SheetNames) {
		const year = parseInt(sheetName, 10);
		if (isNaN(year) || year < 2000 || year > 2100) continue;

		const ws = wb.Sheets[sheetName];
		if (!ws) continue;

		// Contract dates: P9 = col 15, row 8 (0-indexed) — Q9 = col 16, row 8
		const p9 = ws[XLSX.utils.encode_cell({ r: 8, c: 15 })];
		const q9 = ws[XLSX.utils.encode_cell({ r: 8, c: 16 })];

		const start = parseCellDate(p9);
		const end = parseCellDate(q9);
		if (start) contractStart = start;
		if (end) contractEnd = end;

		// Reference colors: N21 = entreprise, N22 = école, N23 = école distanciel
		// N = col 13 (0-indexed), rows 20/21/22
		const getCell = (r: number, c: number) =>
			ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;

		const refColors = new Set([
			extractCellColor(getCell(20, 13)),
			extractCellColor(getCell(21, 13)),
			extractCellColor(getCell(22, 13)),
		].filter(Boolean) as string[]);

		// Month columns: A (0) = Jan → L (11) = Dec
		// Day rows: 7 to 37 in Excel = index 6 to 36 (0-indexed)
		for (let col = 0; col <= 11; col++) {
			const month = col; // 0 = January

			for (let row = 6; row <= 36; row++) {
				const addr = XLSX.utils.encode_cell({ r: row, c: col });
				const cell = ws[addr];

				if (!cell?.v) continue; // Empty = outside contract period

				const value = String(cell.v).trim();
				// Format: "L 1", "M 15", "V 30" — extract the day number
				const parts = value.split(' ');
				if (parts.length < 2) continue;
				const day = parseInt(parts[parts.length - 1], 10);
				if (isNaN(day) || day < 1 || day > 31) continue;

				// Validate date (catches e.g. "M 30" for September which has no day 31)
				const date = new Date(year, month, day);
				if (date.getMonth() !== month) continue;

				const color = extractCellColor(cell);

				// Only keep days whose color matches one of the 3 reference colors
				if (!color || !refColors.has(color)) continue;

				days[date.toISOString().slice(0, 10)] = color;
			}
		}
	}

	return { days, contractStart, contractEnd };
}
