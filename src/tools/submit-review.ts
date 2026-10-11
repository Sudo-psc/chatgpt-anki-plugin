import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeReviewRating } from '../anki/review.js';
import {
  buildWidgetMeta,
  okResult,
  REVIEW_SESSION_WIDGET_URI,
  runToolWithTelemetry,
  type ToolExecutionContext,
} from './context.js';

const ratingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.enum(['again', 'hard', 'good', 'easy', 'Again', 'Hard', 'Good', 'Easy', '1', '2', '3', '4']),
]);

export function registerSubmitReviewTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'submit_review',
    {
      title: 'Submit Anki Card Review Rating',
      description:
        'Record a spaced-repetition review rating for a card: 1 = Again (forgot), 2 = Hard, 3 = Good, 4 = Easy.',
      inputSchema: {
        cardId: z.number().int().positive().describe('Numeric cardId of the card being reviewed.'),
        rating: ratingSchema.describe(
          'Review rating: 1 / "again", 2 / "hard", 3 / "good", or 4 / "easy".',
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        templateUri: REVIEW_SESSION_WIDGET_URI,
        invoking: 'Recording card review…',
        invoked: 'Card review recorded',
        widgetAccessible: true,
      }),
    },
    async (args) =>
      runToolWithTelemetry('submit_review', ctx, { requiredScope: 'anki:review', requiresWrite: true }, async () => {
        const { ease } = normalizeReviewRating(args.rating);
        const res = await ctx.anki.submitReview(args.cardId, ease);
        return okResult(
          { ...res },
          `Recorded '${res.ratingLabel}' (ease=${res.ease}) for card ${res.cardId}. New interval: ${res.updatedCard.interval} day(s).`,
          REVIEW_SESSION_WIDGET_URI,
        );
      }),
  );
}
