import { RemixPlan } from '../remixPlan';

describe('RemixPlan', () => {
  it('constructs a well-formed plan including diagnostics', () => {
    const plan: RemixPlan = {
      chunkIds: ['A1', 'A2', 'B2'],
      totalScore: 12.4,
      estimatedDurationSec: 24,
      diagnostics: {
        nearFailedConstraints: [{ constraintName: 'max-bpm-jump', atChunkId: 'A2' }],
        prunedCandidateCount: 7,
      },
    };
    expect(plan.chunkIds).toHaveLength(3);
    expect(plan.diagnostics.prunedCandidateCount).toBe(7);
    expect(plan.diagnostics.nearFailedConstraints[0].constraintName).toBe('max-bpm-jump');
  });

  it('allows empty diagnostics for a plan with no near-misses', () => {
    const plan: RemixPlan = {
      chunkIds: ['A1'],
      totalScore: 1,
      estimatedDurationSec: 8,
      diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
    };
    expect(plan.diagnostics.nearFailedConstraints).toEqual([]);
  });
});
