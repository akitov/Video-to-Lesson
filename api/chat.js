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

    // MESSAGE 1: System prompt — behavior, rules, output format
    // Kept lean and structural. No data here.
    const systemPrompt = `You are a segment curator for a video learning app. You receive timestamped speech transcripts from two videos and a user query.

YOUR TASK: Find transcript passages relevant to the query and return them as playable video segments.

SEGMENT RULES:
- Each segment must be from ONE video (never cross videos)
- MINIMUM duration: 30 seconds. If a relevant mention is brief, EXPAND the segment to include surrounding context (the chunks before and after) so the viewer gets a complete thought
- MAXIMUM duration: 5 minutes per segment
- Group adjacent relevant chunks into one segment rather than returning many tiny segments
- Return 1-6 segments, ranked by relevance (most relevant first)
- If a topic is discussed in multiple places, return each as a separate segment

EXPANSION STRATEGY: When you find a relevant chunk, always look at the 3-5 chunks before and after it. Include them if they provide setup, explanation, or follow-up to the relevant content. The viewer should be able to watch the segment and understand the full context without needing to watch what came before.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{"segments":[{"title":"Short descriptive title","videoId":"vid-1","start":0,"end":88,"bullets":["First key point (don't repeat title)","Second key point","Third key point"]}]}

Times must be integers (seconds). Use the start time of the first included chunk and end time of the last included chunk.`;

    // MESSAGE 2: Transcript as context (assistant-primed user message)
    // Structured with seconds for easy math, grouped by video
    const transcriptMessage = `Here is the full timestamped transcript. Each line is: [videoId startSeconds-endSeconds] spoken text

${transcript}`;

    // MESSAGE 3: The actual user query — clean and separate
    const userMessage = `Find segments relevant to: "${message}"`;

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
          { role: 'user', content: transcriptMessage },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 2048,
        temperature: 0.2,
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
