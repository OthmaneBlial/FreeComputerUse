import { z } from 'zod';

const text = z.string().min(1).max(2000);
export const SemanticTargetSchema = z.object({
  role: text.optional(), name: text.optional(), label: text.optional(),
  placeholder: text.optional(), testId: text.optional(), id: text.optional(),
  attributeName: text.optional(), text: text.optional(), css: text.optional(),
  frame: z.number().int().min(0).optional(),
}).strict().refine(t => Object.keys(t).some(k => k !== 'frame'), 'Empty target');
export const TargetSchema = z.union([text, SemanticTargetSchema]);
export type SemanticTarget = z.infer<typeof SemanticTargetSchema>;
export type Target = z.infer<typeof TargetSchema>;

export const ConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input_value_equals'), target: TargetSchema, value: z.string().max(10000) }).strict(),
  ...(['element_exists', 'element_visible', 'element_not_visible', 'checkbox_checked', 'form_submitted'] as const)
    .map(type => z.object({ type: z.literal(type), target: TargetSchema }).strict()),
  ...(['url_equals', 'url_contains', 'text_exists', 'text_disappeared', 'title_changed'] as const)
    .map(type => z.object({ type: z.literal(type), value: text }).strict()),
  z.object({ type: z.literal('network_response'), value: text, status: z.number().int().min(100).max(599).optional() }).strict(),
  z.object({ type: z.literal('download_created'), value: text.optional() }).strict(),
  z.object({ type: z.literal('page_changed'), value: text }).strict(),
]);
export type Condition = z.infer<typeof ConditionSchema>;
const meta = {
  sensitive: z.boolean().optional(),
  verify: z.array(ConditionSchema).max(12).optional(),
  timeoutMs: z.number().int().min(100).max(30000).optional(),
};
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('switchTab'), index: z.number().int().min(0).max(100), ...meta }).strict(),
  ...(['click', 'doubleClick', 'hover', 'check', 'uncheck', 'submit'] as const)
    .map(type => z.object({ type: z.literal(type), target: TargetSchema, ...meta }).strict()),
  ...(['fill', 'type', 'select', 'press'] as const)
    .map(type => z.object({ type: z.literal(type), target: TargetSchema, value: z.string().max(10000), ...meta }).strict()),
  ...(['navigate', 'openTab'] as const)
    .map(type => z.object({ type: z.literal(type), url: text, ...meta }).strict()),
  z.object({ type: z.literal('upload'), target: TargetSchema, file: text, ...meta }).strict(),
  z.object({ type: z.literal('download'), target: TargetSchema, filename: text.optional(), ...meta }).strict(),
  z.object({ type: z.literal('extract'), target: TargetSchema.optional(), format: z.enum(['text', 'table', 'links']).default('text'), key: text.default('result'), match: text.optional(), limit: z.number().int().min(1).max(1000).optional(), ...meta }).strict(),
  z.object({ type: z.literal('wait'), condition: ConditionSchema, ...meta }).strict(),
  z.object({ type: z.literal('scroll'), target: TargetSchema.optional(), direction: z.enum(['up','down']).default('down'), pixels: z.number().int().min(1).max(10000).default(600), ...meta }).strict(),
  ...(['closeTab', 'back', 'forward', 'reload'] as const)
    .map(type => z.object({ type: z.literal(type), ...meta }).strict()),
]);
export type Action = z.infer<typeof ActionSchema>;
export const PlanSchema = z.object({
  goal: text, steps: z.array(text).min(1).max(12),
  actions: z.array(ActionSchema).min(1).max(80),
  completion: z.array(ConditionSchema).min(1).max(12),
  continue: z.boolean().default(false),
}).strict();
export type Plan = z.infer<typeof PlanSchema>;
export const RepairSchema = z.object({
  actions: z.array(ActionSchema).max(20),
  replace: z.number().int().min(0).max(20).default(1),
  completion: z.array(ConditionSchema).min(1).max(12).optional(),
  continue: z.boolean().optional(),
}).strict().refine(r=>r.actions.length>0||!!r.completion,'Repair needs actions or corrected completion conditions');
export type Repair = z.infer<typeof RepairSchema>;
export const validateAction = (value: unknown) => ActionSchema.parse(value);
export const validatePlan = (value: unknown) => PlanSchema.parse(value);
