import { Renderer, RenderOptions, RenderedAudio } from '../renderer';
import { RemixPlan } from '../remixPlan';
import { MusicGraph } from '../musicGraph';

describe('Renderer interface', () => {
  it('is satisfied by a stub async implementation', async () => {
    const stub: Renderer = {
      render: async (_plan, _graph, _options): Promise<RenderedAudio> => ({
        sampleRate: 44100,
        channels: 2,
        durationSec: 24,
        filePath: '/tmp/out.wav',
      }),
    };

    const plan: RemixPlan = {
      chunkIds: ['A1'],
      totalScore: 1,
      estimatedDurationSec: 24,
      diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
    };
    const graph: MusicGraph = { nodes: new Map(), edges: new Map(), getOutgoingEdges: () => [], getNode: () => undefined };
    const options: RenderOptions = { crossfadeCurve: 'equalPower', normalizeLoudnessLufs: -14 };

    const result = await stub.render(plan, graph, options);
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(2);
  });
});
