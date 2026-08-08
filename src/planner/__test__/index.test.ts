import * as planner from '../index';

describe('src/planner barrel export', () => {
  it('re-exports planRemix, initialState, selectDiverseBeam, handleDeadEnd, isPlanFailure', () => {
    expect(typeof planner.planRemix).toBe('function');
    expect(typeof planner.initialState).toBe('function');
    expect(typeof planner.updateResources).toBe('function');
    expect(typeof planner.isValidResources).toBe('function');
    expect(typeof planner.selectDiverseBeam).toBe('function');
    expect(typeof planner.handleDeadEnd).toBe('function');
    expect(typeof planner.toRemixPlan).toBe('function');
    expect(typeof planner.isWithinTargetDuration).toBe('function');
    expect(typeof planner.isPlanFailure).toBe('function');
    expect(typeof planner.compareStatesByScoreThenId).toBe('function');
  });
});
