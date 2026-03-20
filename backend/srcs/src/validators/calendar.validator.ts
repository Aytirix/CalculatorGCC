import { z } from 'zod';

// ── Primitives ─────────────────────────────────────────────────────────────

const IsoDate = z.string().regex(
	/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/,
	'Invalid date format',
);

const IsoDateOnly = z.string().regex(
	/^\d{4}-\d{2}-\d{2}$/,
	'Invalid date-only format',
);

const HexColor = z.string().regex(
	/^#[0-9A-Fa-f]{6}$/,
	'Invalid hex color',
);

// ── Schemas ────────────────────────────────────────────────────────────────

const PlacedProjectSchema = z.object({
	id:          z.string().min(1).max(256),
	projectId:   z.string().min(1).max(128),
	name:        z.string().min(1).max(256),
	xp:          z.number().int().min(0).max(100_000),
	startDate:   IsoDate,
	endDate:     IsoDate,
	row:         z.number().int().min(0).max(200),
}).strict();

const DateRangeSchema = z.object({
	start: IsoDateOnly,
	end:   IsoDateOnly,
}).strict().refine(
	({ start, end }) => start <= end,
	{ message: 'start must be before or equal to end' },
);

const AlternanceDaysSchema = z.record(IsoDateOnly, HexColor);

export const CalendarDataSchema = z.object({
	placedProjects: z.array(PlacedProjectSchema).max(500),
	dateRange:      DateRangeSchema,
	alternanceDays: AlternanceDaysSchema.optional().default({}),
}).strict().superRefine((data, ctx) => {
	// Limit alternance entries (~4 years of daily data max)
	const altCount = Object.keys(data.alternanceDays ?? {}).length;
	if (altCount > 2000) {
		ctx.addIssue({
			code: z.ZodIssueCode.too_big,
			maximum: 2000,
			type: 'array',
			inclusive: true,
			message: `alternanceDays exceeds maximum of 2000 entries (got ${altCount})`,
		});
	}
});

export type CalendarData = z.infer<typeof CalendarDataSchema>;
