import { RemixPlan } from '../core';

export interface PlanFailure {
  readonly failure: 'no_valid_path';
  readonly bestPartial?: RemixPlan;
}

export type PlanResult = RemixPlan | PlanFailure;
