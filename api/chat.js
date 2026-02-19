export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OAI_API_KEY not configured' });
  }

  try {
    const { message, transcript } = req.body;

    const systemPrompt = `You are a video segment curator for an interactive learning app. You receive the full speech-to-text transcript of two videos about Claude Code, with timestamps and video IDs.

Your job: given a user's search query or topic of interest, find the most relevant portions of the transcript and return them as playable segments. Group nearby transcript chunks into coherent segments that cover a single idea or topic.

RULES:
- Each segment must map to a continuous time range within ONE video (no cross-video segments)
- Use the actual start time of the first relevant chunk and end time of the last relevant chunk in each group
- Group chunks that are close together (within ~60s) and on the same topic into one segment
- Return 1-8 segments, ranked by relevance
- Each segment needs: a short descriptive title, videoId, start/end times (in seconds), and 2-3 bullet points summarizing what is discussed
- Bullets should NOT repeat the title

IMPORTANT: Respond with ONLY valid JSON, no markdown fences, no explanation. Use this exact format:
{"segments":[{"title":"...","videoId":"vid-1","start":0,"end":88,"bullets":["...","...","..."]}]}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `TRANSCRIPT:\n${transcript}\n\nUSER QUERY: ${message}` }
        ],
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'OpenAI API error' });
    }

    const data = await response.json();
    const raw = data.choices[0].message.content;

    // Parse JSON from response (strip markdown fences if present)
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
