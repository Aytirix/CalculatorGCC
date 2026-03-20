declare module 'xlsx' {
	interface CellObject {
		v?: unknown;
		t?: string;
		s?: unknown;
	}

	interface WorkSheet {
		[cell: string]: CellObject | unknown;
	}

	interface WorkBook {
		SheetNames: string[];
		Sheets: Record<string, WorkSheet>;
	}

	interface ReadOptions {
		cellStyles?: boolean;
		cellDates?: boolean;
		[key: string]: unknown;
	}

	const utils: {
		encode_cell(cell: { r: number; c: number }): string;
	};

	function read(data: ArrayBuffer, opts?: ReadOptions): WorkBook;
}
