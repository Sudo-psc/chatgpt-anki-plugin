import { z } from 'zod';
import { defineTool, ToolErrors } from './types.js';

const updateModelTemplates = defineTool({
  name: 'update_model_templates',
  title: 'Update note type templates (admin)',
  description:
    'Update the card template (front/back) or the CSS styling of a note type (model). Requires the admin scope. Changes affect every card of that note type — review carefully. If the model has multiple templates, specify template_name.',
  scope: 'anki:admin',
  annotations: { destructiveHint: true, idempotentHint: true },
  inputSchema: z.object({
    model: z.string().min(1).describe('Note type (model) name, e.g. "Basic"'),
    template_name: z.string().min(1).optional().describe('Card template name (required when the model has multiple templates)'),
    front: z.string().optional().describe('New front template HTML'),
    back: z.string().optional().describe('New back template HTML'),
    css: z.string().optional().describe('New CSS for the note type'),
  }),
  outputSchema: z.object({
    updated: z.literal(true),
    model: z.string(),
    templates_updated: z.array(z.string()),
    css_updated: z.boolean(),
  }),
  handler: async (input, ctx) => {
    const hasTemplateChange = input.front !== undefined || input.back !== undefined;
    if (!hasTemplateChange && input.css === undefined) {
      throw ToolErrors.validation(
        'update_model_templates requires at least one of "front", "back" or "css".',
        'Example: {"model": "Basic", "front": "{{Front}}"}',
      );
    }
    const modelNames = await ctx.gateway.notes.modelNames();
    if (!modelNames.includes(input.model)) {
      throw ToolErrors.notFound(
        `Model "${input.model}" not found. Available models: ${modelNames.join(', ')}.`,
      );
    }

    let templatesUpdated: string[] = [];
    if (hasTemplateChange) {
      const templates = await ctx.gateway.notes.modelTemplates(input.model);
      const names = Object.keys(templates);
      let templateName = input.template_name;
      if (templateName === undefined) {
        if (names.length === 1) {
          templateName = names[0] as string;
        } else {
          throw ToolErrors.validation(
            `Model "${input.model}" has ${names.length} templates; specify "template_name" (one of: ${names.join(', ')}).`,
          );
        }
      } else if (!names.includes(templateName)) {
        throw ToolErrors.notFound(
          `Template "${templateName}" not found on model "${input.model}". Available templates: ${names.join(', ')}.`,
        );
      }
      const existing = templates[templateName] as { Front: string; Back: string };
      await ctx.gateway.notes.updateModelTemplates(input.model, {
        [templateName]: {
          Front: input.front ?? existing.Front,
          Back: input.back ?? existing.Back,
        },
      });
      templatesUpdated = [templateName];
    }

    let cssUpdated = false;
    if (input.css !== undefined) {
      await ctx.gateway.notes.updateModelStyling(input.model, input.css);
      cssUpdated = true;
    }

    return {
      updated: true as const,
      model: input.model,
      templates_updated: templatesUpdated,
      css_updated: cssUpdated,
    };
  },
});

export const modelTools = [updateModelTemplates];
