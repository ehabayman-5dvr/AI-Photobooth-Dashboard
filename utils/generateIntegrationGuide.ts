import { AiProvider, ProjectPlatformType } from '@/types';

export interface IntegrationGuideOptions {
    projectId: string;
    projectName: string;
    projectType: ProjectPlatformType;
    baseUrl: string;
    cloudinaryFolder: string;
    selectedAiModel: string;
    aiModelProvider: AiProvider;
    dailyLimit: number;
    referenceImagesCount: number;
}

export function getIntegrationGuideFilename(projectName: string): string {
    const slug =
        (projectName || 'photobooth-project')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'photobooth-project';
    return `${slug}-agent-integration.md`;
}

export function generateIntegrationGuideMarkdown(opts: IntegrationGuideOptions): string {
    const cleanBaseUrl = (opts.baseUrl || 'https://ai-photobooth-dashboard.vercel.app').replace(
        /\/+$/,
        ''
    );
    const settingsUrl = `${cleanBaseUrl}/api/projects/${opts.projectId}/settings`;
    const generateUrl = `${cleanBaseUrl}/api/projects/${opts.projectId}/generate`;
    const printUrl = `${cleanBaseUrl}/api/projects/${opts.projectId}/print`;
    const folder = opts.cloudinaryFolder || opts.projectName.trim().replace(/\s+/g, '-');

    if (opts.projectType === 'web') {
        return buildWebIntegrationMarkdown({
            ...opts,
            cleanBaseUrl,
            settingsUrl,
            generateUrl,
            folder,
        });
    }

    return buildDesktopIntegrationMarkdown({
        ...opts,
        cleanBaseUrl,
        settingsUrl,
        generateUrl,
        printUrl,
        folder,
    });
}

function buildSharedPromptEngineSection(opts: IntegrationGuideOptions): string {
    const refModeNote =
        opts.referenceImagesCount >= 2
            ? `This project is currently configured for **${opts.referenceImagesCount >= 3 ? '2+ reference images' : '2 reference images'}** on the Dashboard (e.g., \`IMAGE 1\` = Guest Capture + \`IMAGE 2\` = Empty Scene/Monument Reference Plate). Confirm exact reference plates with the developer.`
            : `This project is currently configured for **1 reference image** (\`IMAGE 1\` = Guest Capture only) on the Dashboard. Confirm during the interview whether empty scene reference plates (\`IMAGE 2\`) will also be used.`;

    return `## Standardized 7-Block Prompt Crafting Engine (Mandatory Pattern)

${refModeNote}

When building \`src/services/promptCraftingService.ts\` (or server-side equivalent for Web), use the proven **5DVR 7-Block Prompt Architecture** (from \`photobooth-face-prompt-crafting\`):

1. **Paired Sequential Variations (\`ERA_SCENES\` + \`ERA_OUTFITS\`):**
   - Define aligned arrays of \`SceneVariation\` (\`id\`, \`name\`, \`landmark\`, \`description\`, \`lighting\`, \`poseDirective\`, optional \`referenceImage\`) and \`OutfitVariation\` (\`id\`, \`name\`, \`style\`, \`description\` for Men/Boys, \`femaleNotes\` for Women/Girls).
   - Advance variation index sequentially after each successful generation (\`(index + 1) % scenes.length\`) and reset back to \`0\` when the guest switches to a different mode/era.
   - If \`referenceImage\` is provided, visually inspect each reference plate file first so \`scene.description\` and \`scene.lighting\` match the plate's exact architecture, props, camera angle, and color/monochrome grade.
2. **Soft-Hint Subject Directive (\`buildSubjectDirective\`):**
   - Never pass \`face-api.js\` counts as a rigid cap (which causes models to drop people if a face was tilted). Frame local detection as a **soft lower-bound hint** (\`"detected at least X people ... IMAGE 1 is the SOLE authority for the true headcount: visually inspect IMAGE 1 and include 100% of visible participants"\`).
3. **Conditional Safe-Area & Framing Mode (\`FramingMode\`):**
   - **\`'ornate_frame'\`** *(custom PNG border/medallion overlay)*: Keep all faces and tall headwear at least **15% from the top edge** and **12% from the side edges** (inspect the actual \`frame.png\` to verify inner window bounds), forbid AI-generated borders, and composite the PNG frame afterward (using a BFS outer-alpha flood-fill mask if the frame has curved/transparent outer corners).
   - **\`'logo_only'\`** *(corner/bottom watermark badges, no border frame)*: Do **not** apply the 15%/12% frame inset. Use natural portrait headroom (\`~8%\` top) and keep key props/hands clear of the badge placement zone.
   - **\`'unframed'\`** *(full-bleed portrait, no frame or overlay)*: Natural full-bleed 2:3 portrait framing (\`~5–8%\` edge breathing room only if physical borderless dye-sub printing is used; zero inset for digital-only output).

\`\`\`typescript
export type FramingMode = 'ornate_frame' | 'logo_only' | 'unframed';

export interface SceneVariation {
  id: string;
  name: string;
  landmark: string;
  description: string;
  lighting: string;
  poseDirective?: string;   // Solo vs. group pose + theme props
  referenceImage?: string;  // Optional IMAGE 2 empty scene/monument plate
}

export interface OutfitVariation {
  id: string;
  name: string;
  style: string;
  description: string;      // Shared base garments + FOR MEN / BOYS directive
  femaleNotes?: string;     // FOR WOMEN / GIRLS: (A) Hijab + long opaque sleeves vs (B) Uncovered natural hair
}

export function buildCompositionDirective(
  framingMode: FramingMode,
  isPrintedKiosk: boolean
): string {
  if (framingMode === 'ornate_frame') {
    return 'COMPOSITION & SAFE AREA: Output a single coherent 2:3 vertical portrait, never a collage. Keep all faces and headwear inside the central safe area, at least 15% from the top edge and 12% from the side edges to leave room for the custom overlay frame. Use natural skin texture, convincing ground/seat contact shadows, print-friendly brightness, and anatomically accurate hands. No added text, dates, logos, watermarks, or borders—the frame will be applied separately.';
  }
  if (framingMode === 'logo_only') {
    return 'COMPOSITION & SAFE AREA: Output a single coherent 2:3 vertical portrait, never a collage. Use natural portrait framing with ~8% top headroom above heads/hair and keep key props clear of the logo badge area. Use natural skin texture, convincing contact shadows, and anatomically accurate hands. No added text, dates, watermarks, or borders.';
  }
  return \`COMPOSITION & SAFE AREA: Output a single coherent 2:3 vertical full-bleed portrait, never a collage. \${
    isPrintedKiosk
      ? 'Keep ~6% breathing room from the outer edges to account for borderless printer overscan.'
      : 'Frame subjects naturally across the full portrait canvas with comfortable headroom.'
  } Use natural skin texture, convincing contact shadows, and anatomically accurate hands. No added text, dates, logos, watermarks, or borders.\`;
}

// 7-Block Assembly Order inside your prompt builder:
// 1. Input Image Roles:
//    - If referenceImage exists: IMAGE 1 = Guest Capture (SOLE authority for faces, count, age/gender, hijab vs uncovered hair);
//      IMAGE 2 = Empty Scene/Monument Reference Plate (NO people; match architecture, perspective & lighting).
//    - Else: Single input image is the sole identity reference.
// 2. Soft-Hint Subject Directive (from face-api.js + vision fallback)
// 3. 1:1 FACIAL IDENTITY LOCK (zero beautification, morphing, face averaging, or expression changes)
// 4. WARDROBE & HEADWEAR (OutfitVariation.description + OutfitVariation.femaleNotes with (A) Hijab & full-length opaque sleeves vs (B) Uncovered hair)
// 5. STRICT MODESTY & HEADCOVER MANDATE (100% opaque chest/torso/shoulder coverage for all men, women, and children; never shirtless; never add hijab if absent in IMAGE 1)
// 6. ICONIC POSE & PROPS (SceneVariation.poseDirective covering both 1 solo guest and 2+ group guests)
// 7. ENVIRONMENT + buildCompositionDirective(framingMode, isPrintedKiosk)
\`\`\``;
}

function buildDesktopIntegrationMarkdown(
    opts: IntegrationGuideOptions & {
        cleanBaseUrl: string;
        settingsUrl: string;
        generateUrl: string;
        printUrl: string;
        folder: string;
    }
): string {
    return `# 5DVR Photobooth Dashboard — AI Agent Integration Guide (Desktop Kiosk)

> **Target Project:** \`${opts.projectName}\`
> **Platform Type:** \`desktop\` (Electron / Physical Event Kiosk)
> **Project UUID:** \`${opts.projectId}\`
> **Dashboard Base URL:** \`${opts.cleanBaseUrl}\`
>
> **Recommended Kickoff in Antigravity:** Type \`/grill-me\` in chat and attach/paste this \`.md\` file so the agent interviews you on every design, framing, asset, and prompt requirement before writing code.

Use this guide to build or connect this **Desktop Photobooth Kiosk** to the centralized **5DVR AI Photobooth Dashboard**. No secrets or API keys are hardcoded in this file — all cloud credentials are fetched dynamically at runtime from the Dashboard API.

---

## 0. Mandatory Pre-Implementation Interview ("Grill-Me Protocol")

> **AGENT INSTRUCTION — STOP & INTERVIEW FIRST:**
> Whether or not the user invoked \`/grill-me\`, **do NOT scaffold or write code on assumptions**. Before implementing a new booth (or major theme update), inspect the workspace for any existing \`public/assets\` files and use \`ask_question\` to interview the developer on any unresolved items below:

1. **Theme & Mode Selection Flow:** Is this a single unified theme (\`Splash -> Capture\`) or does it need an **Era / Mode Selection screen** (\`era_selection\`, e.g., 2–4 themed cards)? What are the exact mode names and visual tone?
2. **Reference Image Strategy:** Will generation use **1 image** (\`IMAGE 1\` guest capture only) or **Dual-Image** (\`IMAGE 1\` guest capture + \`IMAGE 2\` empty scene/monument reference plates in \`public/assets/Era-References/\`, currently configured on Dashboard as \`referenceImagesCount = ${opts.referenceImagesCount}\`)?
3. **Variations, Poses & Color Grade:** How many sequential paired \`Scene + Outfit\` variations per mode (e.g., 2–5)? Should specific variants feature custom poses/props or special color treatments (e.g., vintage B&W/sepia vs. full color)?
4. **Output Branding & Frame Mode *(Not All Projects Have Frames!)*:**
   - **Ornate Frame Overlay (\`frame.png\`):** Requires \`15%\` top / \`12%\` side safe-zone margins in prompts + PNG frame compositing (with BFS outer-alpha mask if corners/medallions have transparent exteriors).
   - **Logo Watermark Badges Only:** No border frame inset; natural \`~8%\` top headroom + clear badge corner/footer.
   - **Full-Bleed Unframed:** No frame or logo overlay; \`~6%\` edge breathing room for borderless dye-sub printer overscan.
5. **UI & Media Assets:** Are screen backgrounds (\`Screens-Assets\`), frames (\`Eras-Frames\`), and loading videos (\`.mp4\`) already provided locally, or should bespoke UI + animations be designed?
6. **2D vs. 3D Experience:** Lightweight 2D transitions/video loops vs. Three.js / React Three Fiber 3D countdown & loading scenes?
7. **Physical Kiosk Hardware Defaults:** Is the camera mounted rotated sideways (\`-90°\` portrait DSLR/webcam) or \`0°\` landscape, and which printer profile is targeted (\`DNP DP-QW410\`, \`Canon SELPHY CP1500\`, or digital QR only)?

---

## 1. 5DVR Photobooth Skills Ecosystem (\`5dvr-photobooth-skills\`)

Load and follow the installed 5DVR skills in \`~/.gemini/config/skills/\` (or mount \`https://github.com/ehabayman-5dvr/5dvr-photobooth-skills\` into \`.agents\`):

- \`photobooth-screen-flow\` — 6-screen state machine, clean camera viewport (no face-oval HUDs), 5s Preview auto-proceed timer, and frame/logo compositing.
- \`photobooth-face-prompt-crafting\` — Offline-first \`face-api.js\` (\`SSD MobileNet V1\`) + 7-block identity/hijab/modesty prompt engine.
- \`photobooth-model-providers\` — OpenAI (\`/v1/images/edits\`) & Gemini (\`/v1beta/interactions\`) adapters, \`AbortController\` timeouts, zero auto-retry on paid calls, and styled operator console prompt logs.
- \`photobooth-operator-settings\` — \`F2\` local hardware/printer/camera/timer modal persisted to local \`operator-settings.json\` *(aligned with the 2-layer rules in Section 3 below)*.
- \`cloudinary-photobooth-upload\` — Web Crypto \`SHA-1\` signed uploads with 3x exponential backoff + chunked prompt context.
- \`photobooth-qr-generator\` — Branded mobile viewer QR (\`https://photobooth-viewer.vercel.app/?url=...&branded=true\`) with fallback.
- \`photobooth-metrics-api\` — Non-blocking \`POST /generate\` and \`POST /print\` telemetry.
- \`photobooth-photo-printing\` — Silent Electron 4x6 borderless printing, ready-first / busy-fallback routing, and print-only padding.
- \`photobooth-electron-packaging\` — Portable Windows \`.exe\` / macOS \`.dmg\` build & clean-machine verification.
- \`photobooth-3d-scene-optimization\` — Non-PBR materials & constant lighting when Three.js / R3F is used.

---

## 2. Environment Configuration (\`.env.local\`)

Configure only the Dashboard base URL and Project UUID in your booth's \`.env.local\` (and bundle them as safe non-secret build defaults for portable Electron builds):

\`\`\`env
VITE_DASHBOARD_URL=${opts.cleanBaseUrl}
VITE_DASHBOARD_PROJECT_ID=${opts.projectId}
\`\`\`

---

## 3. Architecture: Strict 2-Layer Configuration (CRITICAL)

A Desktop Kiosk maintains **two strictly separate configuration files** inside Electron's \`app.getPath('userData')\` (or \`PORTABLE_EXECUTABLE_DIR\` for portable builds). **Never merge them into one file and never overwrite local hardware settings with Cloud API responses.**

| Layer | File on Disk | Source of Truth | Owned Fields | Sync Direction |
| :--- | :--- | :--- | :--- | :--- |
| **1. Cloud Project Config** | \`cloud-config.cache.json\` *(offline boot fallback)* | **Dashboard Backend** (\`GET /settings\` + \`POST /generate\`) | \`isActive\`, \`dailyLimit\`, \`currentGenerations\`, \`aiModelProvider\`, \`openaiModel\` *(locked AI model)*, \`openaiApiKey\`, \`geminiApiKey\`, \`referenceImagesCount\`, \`cloudinaryCloudName\`, \`cloudinaryApiKey\`, \`cloudinaryApiSecret\`, \`cloudinaryFolder\` | **Cloud → Booth ONLY (\`GET\`)** |
| **2. Local Operator Settings** | \`operator-settings.json\` | **Local Kiosk \`F2\` Operator Panel** | \`enablePrinting\`, \`selectedPrinterName\`, \`printerNames\`, \`printCopies\`, \`autoPrintOnResult\`, \`singlePrintPerSession\`, \`compositeFrameAndLogos\`, \`printFillColor\`, \`printScaleDownPercent\`, \`printTop/Bottom/Left/RightPaddingPx\`, \`selectedCameraId\`, \`cameraRotation\`, \`cameraMirror\`, \`countdownSeconds\`, screen timers, \`kioskLocked\`, \`operatorPassword\`, \`photoViewerUrl\`, \`previewMode\`, and OpenAI \`imageQuality\` (\`'low' \\| 'medium' \\| 'high'\`) | **100% Local on Booth** *(never sent to backend)* |

### Rules for the Coding Agent
1. **Read-Only Cloud Config:** Never \`POST\` or \`PUT\` from the booth to \`/settings\`. Only call \`GET ${opts.settingsUrl}\`.
2. **Locked AI Model & Cloud Keys:** The active AI model (currently \`${opts.selectedAiModel}\` via \`${opts.aiModelProvider}\`), provider API key, and Cloudinary credentials come exclusively from the Dashboard. Do **not** render editable AI model dropdowns or API key inputs in \`F2\`; show the active model name, Cloudinary folder (\`${opts.folder}\`), and usage counter as **read-only status badges** in \`F2\` with a **"Sync Cloud Config Now"** button.
3. **Offline Boot Resilience:** Whenever \`GET /settings\` succeeds, write the JSON response to \`cloud-config.cache.json\`. If venue Wi-Fi is temporarily down when the kiosk PC boots, load \`cloud-config.cache.json\` so the booth starts cleanly and retry syncing in the background.
4. **Direct Heavy Payloads:** Call OpenAI / Google Gemini and Cloudinary **directly from the booth** (never proxy multi-megabyte base64 images through the Dashboard backend).

---

## 4. Endpoint 1 — Cloud Config Sync (\`GET /settings\`)

- **Method & URL:**
  \`\`\`http
  GET ${opts.settingsUrl}
  \`\`\`

### Response Schema (\`DashboardCloudConfig\`)

\`\`\`typescript
export interface DashboardCloudConfig {
  dashboardProjectId: string;       // "${opts.projectId}"
  projectName: string;              // "${opts.projectName}"
  isActive: boolean;                // false = project marked "Finished" on Dashboard
  dailyLimit: number;               // Portrait cap (e.g. ${opts.dailyLimit})
  currentGenerations: number;       // Portraits generated so far
  projectType: 'desktop' | 'web';   // "desktop"
  cloudinaryAccountId: string | null;
  cloudinaryAccountLabel: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  cloudinaryFolder: string;         // "${opts.folder}"
  aiModelId: string | null;
  aiModelProvider: 'openai' | 'gemini';
  openaiModel: string;              // Active model ID (e.g. "${opts.selectedAiModel}")
  aiModelsList: string[];           // Single-element array [openaiModel]
  openaiApiKey: string;             // Populated when aiModelProvider === 'openai'
  geminiApiKey: string;             // Populated when aiModelProvider === 'gemini'
  referenceImagesCount: number;     // 1, 2, or 3 (2+ refs)
  totalPrintedCopies: number;       // Total physical prints recorded
}

export interface SettingsSyncResponse {
  projectId: string;
  updatedAt?: string;
  settings: DashboardCloudConfig;
}
\`\`\`

### Enforcement & AI Routing Logic

1. **Event Gate Check (Before Starting a Session):**
   - If \`!cloudConfig.isActive\` → Disable Start button and show *"This event has finished."*
   - If \`cloudConfig.currentGenerations >= cloudConfig.dailyLimit\` → Disable Start button and show *"Portrait limit reached."*
2. **Dynamic AI Provider Routing:**
   - Check \`cloudConfig.aiModelProvider\`:
     - \`'openai'\`: Call OpenAI \`POST https://api.openai.com/v1/images/edits\` (multipart \`image[]\`) using \`model = cloudConfig.openaiModel\`, \`apiKey = cloudConfig.openaiApiKey\`, and \`quality = localOperatorSettings.imageQuality\`.
     - \`'gemini'\`: Call Google Gemini \`POST https://generativelanguage.googleapis.com/v1beta/interactions\` using \`model = cloudConfig.openaiModel\` and \`apiKey = cloudConfig.geminiApiKey\` (\`image/jpeg\`, \`2:3\`, \`1K\`, \`thinking_level: 'minimal'\`, \`store: false\`; ignore \`imageQuality\`).

---

${buildSharedPromptEngineSection(opts)}

---

## 5. Direct Cloudinary Upload & Prompt Context Contract

Upload generated portraits directly to Cloudinary using the credentials from \`cloudConfig\` so they appear immediately in the Dashboard **Gallery** and **Featured** tabs — **with prompt metadata attached** so the Dashboard's **Portrait Details (\`ⓘ\`)** drawer displays \`Full Generation Prompt\`.

### Cloudinary Signed Upload Rules
- **Endpoint:** \`POST https://api.cloudinary.com/v1_1/\${cloudConfig.cloudinaryCloudName}/image/upload\`
- **Folder & Tag:** Pass \`folder = cloudConfig.cloudinaryFolder\` and \`tags = cloudConfig.cloudinaryFolder\`.
- **Prompt Metadata Chunking (\`context\`):** Cloudinary context values have a ~1,000-character limit per key and use \`|\` and \`=\` as delimiters. Split the full prompt into 900-character chunks named \`prompt_0\`, \`prompt_1\`, \`prompt_2\`, …:

\`\`\`typescript
function buildCloudinaryContextString(fullPrompt: string, extra?: Record<string, string>): string {
  const sanitize = (str: string) =>
    str.replace(/\\\\/g, '\\\\\\\\').replace(/\\|/g, '\\\\|').replace(/=/g, '\\\\=');

  const pairs: string[] = [];
  const trimmed = (fullPrompt || '').trim();
  if (trimmed) {
    const chunkSize = 900;
    for (let i = 0; i < trimmed.length; i += chunkSize) {
      const idx = Math.floor(i / chunkSize);
      pairs.push(\`prompt_\${idx}=\${sanitize(trimmed.slice(i, i + chunkSize))}\`);
    }
  }

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) pairs.push(\`\${k}=\${sanitize(v)}\`);
    }
  }

  return pairs.join('|');
}
\`\`\`

> **Important SHA-1 Signature Rule:** Include every non-file parameter you append to \`FormData\` (\`context\`, \`folder\`, \`tags\`, \`timestamp\`) sorted **alphabetically by key** (\`context=...&folder=...&tags=...&timestamp=...\`), append \`cloudConfig.cloudinaryApiSecret\` directly with no \`&\`, and hash with \`SHA-1\`. Never include \`file\` or \`api_key\` in the signature string.

---

## 6. Endpoint 2 — Portrait Counter & Live Status (\`POST /generate\`)

Call this **non-blocking** endpoint immediately after each successful live AI portrait generation (never in Preview/Dry-Run mode). It increments the project counter **and** returns the latest \`isActive\`, \`currentGenerations\`, \`dailyLimit\`, and \`remaining\` values so mid-event changes on the Dashboard sync automatically.

- **Method & URL:**
  \`\`\`http
  POST ${opts.generateUrl}
  Content-Type: application/json
  \`\`\`

\`\`\`typescript
export interface GenerateIncrementResponse {
  success: boolean;
  projectId: string;
  incrementedBy: number;
  isActive: boolean;
  currentGenerations: number;
  dailyLimit: number;
  remaining: number;
  timestamp: string;
}

export async function reportPortraitGenerated(
  onCloudStateUpdate?: (patch: Pick<DashboardCloudConfig, 'isActive' | 'currentGenerations' | 'dailyLimit'>) => void
): Promise<void> {
  try {
    const res = await fetch('${opts.generateUrl}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: Date.now() }),
    });
    if (!res.ok) return;
    const data: GenerateIncrementResponse = await res.json();
    if (data.success && onCloudStateUpdate) {
      onCloudStateUpdate({
        isActive: data.isActive,
        currentGenerations: data.currentGenerations,
        dailyLimit: data.dailyLimit,
      });
    }
  } catch (err) {
    // Non-blocking: never interrupt the guest's Result screen if venue Wi-Fi drops
    console.warn('[Dashboard] Failed to report portrait generation:', err);
  }
}
\`\`\`

---

## 7. Endpoint 3 — Physical Print Counter (\`POST /print\`)

Call this **non-blocking** endpoint whenever the kiosk sends a physical print job to the dye-sublimation printer, passing the number of printed copies.

- **Method & URL:**
  \`\`\`http
  POST ${opts.printUrl}
  Content-Type: application/json
  \`\`\`

\`\`\`typescript
export async function reportPhysicalPrint(copies = 1): Promise<void> {
  try {
    await fetch('${opts.printUrl}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copies: Math.max(1, Math.floor(copies)) }),
    });
  } catch (err) {
    // Non-blocking: never block physical printing if network is offline
    console.warn('[Dashboard] Failed to report printed copies:', err);
  }
}
\`\`\`

---

## 8. Implementation Checklist for the Agent

- [ ] Run the **Section 0 Discovery Interview** (\`ask_question\` / \`/grill-me\`) to confirm eras/modes, reference plates, framing mode (\`ornate_frame\` vs \`logo_only\` vs \`unframed\`), UI assets, 2D/3D style, and camera/printer hardware before coding.
- [ ] Load the relevant global skills from \`5dvr-photobooth-skills\` (Section 1).
- [ ] Add \`VITE_DASHBOARD_URL\` and \`VITE_DASHBOARD_PROJECT_ID\` to \`.env.local\`.
- [ ] Keep \`cloud-config.cache.json\` (from \`GET /settings\`) strictly separate from local \`operator-settings.json\` (\`F2\`).
- [ ] Block new sessions when \`!cloudConfig.isActive\` or \`cloudConfig.currentGenerations >= cloudConfig.dailyLimit\`.
- [ ] Implement the **7-Block Prompt Crafting Engine** with conditional safe-area rules matching the confirmed \`FramingMode\`.
- [ ] Route AI synthesis dynamically using \`cloudConfig.aiModelProvider\` (\`'openai'\` vs \`'gemini'\`) and locked model \`cloudConfig.openaiModel\`.
- [ ] Upload generated portraits to Cloudinary \`folder = cloudConfig.cloudinaryFolder\` with \`prompt_0, prompt_1, ...\` in \`context\`.
- [ ] Trigger \`reportPortraitGenerated()\` (non-blocking) after each live generated image and update in-memory \`isActive\` / \`currentGenerations\` / \`dailyLimit\`.
- [ ] Trigger \`reportPhysicalPrint(copies)\` (non-blocking) whenever a physical print job is dispatched.
`;
}

function buildWebIntegrationMarkdown(
    opts: IntegrationGuideOptions & {
        cleanBaseUrl: string;
        settingsUrl: string;
        generateUrl: string;
        folder: string;
    }
): string {
    return `# 5DVR Photobooth Dashboard — AI Agent Integration Guide (Web App)

> **Target Project:** \`${opts.projectName}\`
> **Platform Type:** \`web\` (Browser / Mobile Web Photobooth)
> **Project UUID:** \`${opts.projectId}\`
> **Dashboard Base URL:** \`${opts.cleanBaseUrl}\`
>
> **Recommended Kickoff in Antigravity:** Type \`/grill-me\` in chat and attach/paste this \`.md\` file so the agent interviews you on every design, framing, asset, and prompt requirement before writing code.

Use this guide to build or connect this **Web Photobooth Application** to the centralized **5DVR AI Photobooth Dashboard**. Because this is a browser-accessible Web App, there is **no local \`F2\` operator panel, no \`operator-settings.json\`, no physical printing, and no kiosk hardware lock**. All credentials are fetched server-side at runtime from the Dashboard API — zero secrets are hardcoded in this file.

---

## 0. Mandatory Pre-Implementation Interview ("Grill-Me Protocol")

> **AGENT INSTRUCTION — STOP & INTERVIEW FIRST:**
> Whether or not the user invoked \`/grill-me\`, **do NOT scaffold or write code on assumptions**. Before implementing a new web photobooth (or major theme update), inspect the workspace for any existing \`public/assets\` files and use \`ask_question\` to interview the developer on any unresolved items below:

1. **Theme & Mode Selection Flow:** Is this a single unified theme (\`Splash -> Capture\`) or does it need an **Era / Mode Selection screen** (\`era_selection\`, e.g., 2–4 themed cards)? What are the exact mode names and visual tone?
2. **Capture Input UX (Mobile & Desktop Browser):** Should guests be able to use live camera capture (\`facingMode: 'user'\` / \`'environment'\`), upload a photo from their phone gallery, or both?
3. **Reference Image Strategy:** Will generation use **1 image** (\`IMAGE 1\` guest photo only) or **Dual-Image** (\`IMAGE 1\` guest photo + \`IMAGE 2\` empty scene/monument reference plates, currently configured on Dashboard as \`referenceImagesCount = ${opts.referenceImagesCount}\`)?
4. **Variations, Poses & Color Grade:** How many sequential paired \`Scene + Outfit\` variations per mode (e.g., 2–5)? Should specific variants feature custom poses/props or special color treatments (e.g., vintage B&W/sepia vs. full color)?
5. **Output Branding & Frame Mode *(Not All Projects Have Frames!)*:**
   - **Ornate Frame Overlay (\`frame.png\`):** Requires \`15%\` top / \`12%\` side safe-zone margins in prompts + PNG frame compositing (with BFS outer-alpha mask if corners/medallions have transparent exteriors).
   - **Logo Watermark Badges Only:** No border frame inset; natural \`~8%\` top headroom + clear badge corner/footer.
   - **Full-Bleed Unframed:** No frame or logo overlay; full-canvas natural portrait framing.
6. **UI Assets & 2D/3D Style:** Are screen assets/frames/videos already provided locally, or should bespoke responsive web UI + 2D/3D loading animations be designed?

---

## 1. 5DVR Photobooth Skills Ecosystem (\`5dvr-photobooth-skills\`)

Load the web-applicable 5DVR skills in \`~/.gemini/config/skills/\` (or from \`https://github.com/ehabayman-5dvr/5dvr-photobooth-skills\`):

- **Use:** \`photobooth-screen-flow\` *(responsive browser adaptation)*, \`photobooth-face-prompt-crafting\`, \`photobooth-model-providers\` *(server-side API route)*, \`cloudinary-photobooth-upload\`, \`photobooth-qr-generator\` *(plus native mobile Web Share / direct download)*, \`photobooth-metrics-api\`, and optionally \`photobooth-3d-scene-optimization\`.
- **Skip (Desktop-Only):** Do **not** use \`photobooth-operator-settings\`, \`photobooth-photo-printing\`, or \`photobooth-electron-packaging\`.

---

## 2. Server Environment Configuration (\`.env.local\`)

Store the Dashboard URL and Project UUID in your server environment variables (do **not** expose \`/settings\` responses directly to the browser client):

\`\`\`env
DASHBOARD_URL=${opts.cleanBaseUrl}
DASHBOARD_PROJECT_ID=${opts.projectId}
\`\`\`

---

## 3. Security & Control-Plane Architecture (CRITICAL)

1. **Server-Side Only for \`GET /settings\`:** \`GET ${opts.settingsUrl}\` returns the project's \`openaiApiKey\` / \`geminiApiKey\` and \`cloudinaryApiSecret\`. Always call \`GET /settings\` from your Web App's **backend API route / Server Action** — **never** call it directly from client-side browser code where guests could inspect DevTools Network responses.
2. **Direct Provider Calls from Your Web App Backend:** Your web app's server route calls OpenAI / Gemini directly (or signs Cloudinary upload params server-side). Never proxy multi-megabyte image buffers through the Dashboard backend.
3. **No Local Operator / Print Layer:** Web booths do not use \`operator-settings.json\` and never call \`/print\`.

---

## 4. Endpoint 1 — Server-Side Cloud Config Sync (\`GET /settings\`)

- **Method & URL:**
  \`\`\`http
  GET ${opts.settingsUrl}
  \`\`\`

### Response Schema (\`DashboardCloudConfig\`)

\`\`\`typescript
export interface DashboardCloudConfig {
  dashboardProjectId: string;       // "${opts.projectId}"
  projectName: string;              // "${opts.projectName}"
  isActive: boolean;                // false = project marked "Finished" on Dashboard
  dailyLimit: number;               // Portrait cap (e.g. ${opts.dailyLimit})
  currentGenerations: number;       // Portraits generated so far
  projectType: 'desktop' | 'web';   // "web"
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  cloudinaryFolder: string;         // "${opts.folder}"
  aiModelId: string | null;
  aiModelProvider: 'openai' | 'gemini';
  openaiModel: string;              // Locked AI model ID (e.g. "${opts.selectedAiModel}")
  aiModelsList: string[];           // [openaiModel]
  openaiApiKey: string;             // Populated when aiModelProvider === 'openai'
  geminiApiKey: string;             // Populated when aiModelProvider === 'gemini'
  referenceImagesCount: number;     // 1, 2, or 3 (2+ refs)
}

export interface SettingsSyncResponse {
  projectId: string;
  updatedAt?: string;
  settings: DashboardCloudConfig;
}
\`\`\`

### Server-Side Enforcement & AI Routing

1. **Fetch Fresh Config (or short 15–30s server cache):**
   \`\`\`typescript
   export async function getCloudBoothConfig(): Promise<DashboardCloudConfig> {
     const res = await fetch('${opts.settingsUrl}', { cache: 'no-store' });
     if (!res.ok) throw new Error(\`Dashboard settings fetch failed: \${res.status}\`);
     const data: SettingsSyncResponse = await res.json();
     return data.settings;
   }
   \`\`\`
2. **Gate Check Before Generating:**
   - If \`!config.isActive\` → Return HTTP \`403\` (\`{ error: 'This event has ended.' }\`) and show an Event Ended state in the web UI.
   - If \`config.currentGenerations >= config.dailyLimit\` → Return HTTP \`429\` (\`{ error: 'Portrait limit reached.' }\`) and disable generation in the web UI.
   - Expose a safe public status endpoint in your web app (returning **only** \`{ isActive, limitReached: currentGenerations >= dailyLimit, projectName }\` with zero API keys) so the landing page can show an immediate closed banner when finished.
3. **Dynamic AI Provider Routing:**
   - \`config.aiModelProvider === 'openai'\` → Call OpenAI \`POST https://api.openai.com/v1/images/edits\` with \`model = config.openaiModel\` and \`apiKey = config.openaiApiKey\`.
   - \`config.aiModelProvider === 'gemini'\` → Call Google Gemini \`POST https://generativelanguage.googleapis.com/v1beta/interactions\` with \`model = config.openaiModel\` and \`apiKey = config.geminiApiKey\` (\`image/jpeg\`, \`2:3\`, \`1K\`, \`thinking_level: 'minimal'\`, \`store: false\`).

---

${buildSharedPromptEngineSection(opts)}

---

## 5. Cloudinary Upload & Prompt Context Contract

Upload generated portraits to Cloudinary using \`config.cloudinaryCloudName\`, \`config.cloudinaryApiKey\`, \`config.cloudinaryApiSecret\`, and \`folder = config.cloudinaryFolder\` so every portrait appears in the Dashboard **Gallery** and **Featured** tabs with its prompt visible in the **Portrait Details (\`ⓘ\`)** drawer.

- **Endpoint:** \`POST https://api.cloudinary.com/v1_1/\${config.cloudinaryCloudName}/image/upload\`
- **Folder & Tag:** \`folder = config.cloudinaryFolder\`, \`tags = config.cloudinaryFolder\`
- **Prompt Metadata Chunking (\`context\`):** Split prompts into 900-character chunks (\`prompt_0\`, \`prompt_1\`, …) so prompts exceeding Cloudinary's ~1,000-char per-key limit are preserved intact:

\`\`\`typescript
export function buildCloudinaryContextString(fullPrompt: string): string {
  const sanitize = (str: string) =>
    str.replace(/\\\\/g, '\\\\\\\\').replace(/\\|/g, '\\\\|').replace(/=/g, '\\\\=');

  const trimmed = (fullPrompt || '').trim();
  if (!trimmed) return '';

  const pairs: string[] = [];
  const chunkSize = 900;
  for (let i = 0; i < trimmed.length; i += chunkSize) {
    const idx = Math.floor(i / chunkSize);
    pairs.push(\`prompt_\${idx}=\${sanitize(trimmed.slice(i, i + chunkSize))}\`);
  }
  return pairs.join('|');
}
\`\`\`

> **SHA-1 Signature Rule:** Sort all signed upload parameters alphabetically (\`context\`, \`folder\`, \`tags\`, \`timestamp\`), join as \`key=value&...\`, append \`config.cloudinaryApiSecret\` with no \`&\`, and compute the hex \`SHA-1\` digest.

---

## 6. Endpoint 2 — Portrait Counter & Live Status (\`POST /generate\`)

Call this **non-blocking** endpoint right after a live portrait is generated to record usage on the Dashboard:

- **Method & URL:**
  \`\`\`http
  POST ${opts.generateUrl}
  Content-Type: application/json
  \`\`\`

\`\`\`typescript
export interface GenerateIncrementResponse {
  success: boolean;
  projectId: string;
  incrementedBy: number;
  isActive: boolean;
  currentGenerations: number;
  dailyLimit: number;
  remaining: number;
  timestamp: string;
}

export async function reportPortraitGenerated(): Promise<GenerateIncrementResponse | null> {
  try {
    const res = await fetch('${opts.generateUrl}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: Date.now() }),
    });
    if (!res.ok) return null;
    return (await res.json()) as GenerateIncrementResponse;
  } catch (err) {
    console.warn('[Dashboard] Failed to increment portrait count:', err);
    return null;
  }
}
\`\`\`

---

## 7. Implementation Checklist for the Agent

- [ ] Run the **Section 0 Discovery Interview** (\`ask_question\` / \`/grill-me\`) to confirm eras/modes, capture UX, reference plates, framing mode (\`ornate_frame\` vs \`logo_only\` vs \`unframed\`), UI assets, and 2D/3D style before coding.
- [ ] Load the web-applicable skills from \`5dvr-photobooth-skills\` (Section 1; skip Desktop-only operator/printer/Electron skills).
- [ ] Add \`DASHBOARD_URL\` and \`DASHBOARD_PROJECT_ID\` to server \`.env.local\`.
- [ ] Fetch \`GET /settings\` strictly on the server (never leak API keys or Cloudinary secrets to the browser).
- [ ] Block generation when \`!config.isActive\` or \`config.currentGenerations >= config.dailyLimit\`.
- [ ] Implement the **7-Block Prompt Crafting Engine** with conditional safe-area rules matching the confirmed \`FramingMode\`.
- [ ] Route AI calls dynamically via \`config.aiModelProvider\` (\`'openai'\` vs \`'gemini'\`) and locked model \`config.openaiModel\`.
- [ ] Upload generated portraits to Cloudinary \`folder = config.cloudinaryFolder\` with \`prompt_0, prompt_1, ...\` context metadata.
- [ ] Call \`POST /generate\` (non-blocking \`try/catch\`) after each successful generation.
`;
}
