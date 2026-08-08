import { PlannerConfig } from '../core';

// A single keyword->weight-delta rule. Rules are applied in order over the
// base config; multiple matching rules in one prompt compose additively.
export interface PromptRule {
  readonly pattern: RegExp;
  readonly apply: (config: PlannerConfig) => PlannerConfig;
  readonly description: string;
}
