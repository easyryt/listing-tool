This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Local phone camera

`npm run dev` also starts the camera connection service. Open [Claims](http://localhost:3000/claims), click **Connect phone** under **Original evidence**, and scan the QR inside the installed **Web Camera** app. Keep both devices on the same private Wi-Fi. The QR contains the laptop’s current address and camera port. If Windows asks about Node.js network access, allow it on the private network.

## Phone camera with Vercel

Connect an [Upstash Redis database](https://vercel.com/marketplace/upstash/upstash-kv) to the Vercel project. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in the target Vercel environment, then redeploy. Leave `NEXT_PUBLIC_PHONE_CAMERA_MODE` unset. Redis holds short-lived pairing details. Photos and MP4 videos transfer directly between Web Camera and the laptop browser over WebRTC.

Install **Web Camera 1.0.6 or newer** on Android. On Claims, click **Connect phone** and scan the QR inside Web Camera. Keep the app open and both devices on the same Wi-Fi. Start or stop recording, take a photo, or control the flashlight from either device. Review captures on the laptop and attach the originals. Hosted pairing starts from the website with no extra service on the laptop.

The Android app accepts `https://listing-tool-three.vercel.app` by default. To test a preview or a custom domain, build the APK with `EXPO_PUBLIC_PHONE_CAMERA_ORIGIN` set to that exact HTTPS origin. Use a preview accessible to both devices.

To test locally with the hosted protocol, run `npx next dev` and use a trusted HTTPS address both devices can reach. The development server keeps the pairing in memory. If Claims stays on `localhost` and the phone connects through a reverse proxy, set `PHONE_CAMERA_DEV_ORIGIN` on the development server to that proxy’s HTTPS origin. The proxy must preserve the public hostname in the `Host` header.

To opt into the installed-app bridge on a hosted deployment, set `NEXT_PUBLIC_PHONE_CAMERA_MODE=bridge` and redeploy.

### Optional local bridge for the installed Web Camera app

On each laptop that will control a phone, open a terminal in the `listing-tool` folder that contains `package.json`. Install dependencies once (or after the lockfile changes), then start the bridge:

```powershell
npm ci
npm run phone-camera
```

Keep the terminal open. On the same laptop, go to [Meesho Claims](https://listing-tool-three.vercel.app/claims) in Chrome and select **Connect phone** under **Original evidence**. Allow **Loopback network** or **Local Network access** if Chrome prompts. If you previously selected Block, change the permission for the Claims site in Chrome’s site settings and reload.

Connect both devices to the same Wi-Fi and scan the QR with the **Web Camera** phone app. Vercel serves the Claims page. The command runs on the laptop and receives captures over Wi-Fi.

For a custom domain or deployment preview, set the exact Claims site origin in the terminal before starting the bridge:

```powershell
$env:PHONE_CAMERA_ALLOWED_ORIGINS = 'https://claims.example.com'
npm run phone-camera
```

If a previous pairing is blocking a new one, use **Start a new session** in the camera dialog. Finish or review any capture still in progress before switching sessions.

## AI providers

The AI image assistant can use either Google Gemini or OpenAI. Choose the provider from **AI generation settings**; the selection is saved in the browser and is also used for variant title generation.

Copy `.env.example` to `.env.local`, then configure one or both providers:

```env
GEMINI_API_KEY=your_gemini_key
GEMINI_CONTENT_MODEL=gemini-3.6-flash

OPENAI_API_KEY=your_openai_key
OPENAI_CONTENT_MODEL=gpt-4.1-mini
```

`AI_PROVIDER=gemini` (or `openai`) sets the server default for requests that do not include a provider. API keys stay on the server and are never exposed to the browser.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
