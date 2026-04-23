export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { imageBase64 } = JSON.parse(event.body);
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) };
    }

    // Convert base64 to binary buffer for multipart upload
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const boundary = '----MacroCamBoundary';

    // Build multipart/form-data body manually
    const formBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="food.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      imageBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    // Step 1: Send image for recognition
    const segRes = await fetch('https://api.logmeal.com/v2/image/segmentation/complete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LOGMEAL_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: formBody
    });

    if (!segRes.ok) {
      const errText = await segRes.text();
      return { statusCode: 200, body: JSON.stringify({ error: `LogMeal segmentation failed: ${errText}` }) };
    }

    const segData = await segRes.json();
    const imageId = segData?.imageId;
    if (!imageId) {
      return { statusCode: 200, body: JSON.stringify({ error: 'No imageId from LogMeal' }) };
    }

    // Step 2: Get nutritional info using imageId
    const nutriRes = await fetch('https://api.logmeal.com/v2/nutrition/recipe/nutritionalInfo', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LOGMEAL_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageId })
    });

    if (!nutriRes.ok) {
      const errText = await nutriRes.text();
      return { statusCode: 200, body: JSON.stringify({ error: `LogMeal nutrition failed: ${errText}` }) };
    }

    const nutriData = await nutriRes.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segData, nutriData })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}