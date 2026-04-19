export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { model, messages, temperature, max_tokens } = JSON.parse(event.body);

    if (model !== 'llama-3.3-70b-versatile') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid model' }) };
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid messages' }) };
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.1,
        max_tokens: Math.min(max_tokens || 1024, 5000)
      })
    });

    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}