import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TITLE_COUNT = 10;
const MAX_AI_ATTEMPTS = 3;

type VariantTitleRequest = {
  parentTitle?: unknown;
  category?: unknown;
  model?: unknown;
  theme?: unknown;
  productType?: unknown;
  count?: unknown;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

function cleanTitle(value: unknown) {
  return String(value || "")
    .replace(/[â€œâ€"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function validTitles(value: unknown, count: number) {
  if (!Array.isArray(value)) return [];

  const uniqueTitles = new Map<string, string>();

  value.forEach((value) => {
    const title = cleanTitle(value);

    if (title.length >= 55 && !uniqueTitles.has(title.toLowerCase())) {
      uniqueTitles.set(title.toLowerCase(), title);
    }
  });

  return Array.from(uniqueTitles.values()).slice(0, count);
}

function promptFor({
  parentTitle,
  category,
  model,
  theme,
  productType,
  count,
}: Required<VariantTitleRequest>) {
  return `
Create exactly ${count} distinct, closely related e-commerce titles for variants of this parent product:

Parent title: ${parentTitle}
Category: ${category}
Phone model: ${model}
Theme: ${theme}
Product type: ${productType}

Return ONLY JSON in this format:
{"titles":["",""]}

Rules:
- Return exactly ${count} titles.
- Keep each title related to the parent design, but make every title meaningfully different.
- Each title must include "${model}" and "${productType}" exactly as selected.
- Use the selected theme naturally.
- Each title must be 55 to 100 characters.
- Do not use quotes, emojis, prices, SKU, version numbers, marketplace names, or unsupported product claims.
`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VariantTitleRequest;
    const parentTitle = cleanTitle(body.parentTitle);
    const category = String(body.category || "").trim();
    const model = String(body.model || "").trim();
    const theme = String(body.theme || "").trim();
    const productType = String(body.productType || "").trim();
    const count = Number(body.count);

    if (!parentTitle || !category || !model || !theme || !productType) {
      return NextResponse.json(
        { error: "Parent product details are required to generate variant titles." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(count) || count < 1 || count > MAX_TITLE_COUNT) {
      return NextResponse.json(
        { error: `Generate between 1 and ${MAX_TITLE_COUNT} variant titles at a time.` },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing in .env.local." },
        { status: 500 },
      );
    }

    const prompt = promptFor({
      parentTitle,
      category,
      model,
      theme,
      productType,
      count,
    });
    const aiModel = process.env.GEMINI_CONTENT_MODEL || "gemini-3.6-flash";

    for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: "application/json",
            },
          }),
        },
      );

      const data = (await response.json()) as GeminiResponse;

      if (!response.ok) {
        throw new Error(data.error?.message || "Gemini could not generate titles.");
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

      if (!text) continue;

      try {
        const titles = validTitles(JSON.parse(text).titles, count);

        if (titles.length === count) {
          return NextResponse.json({ titles });
        }
      } catch {
        // Ask Gemini again if it returns invalid JSON.
      }
    }

    return NextResponse.json(
      { error: "Unable to generate all variant titles. Please try again." },
      { status: 500 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate variant titles.",
      },
      { status: 500 },
    );
  }
}
