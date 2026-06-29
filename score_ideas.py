import json

ideas = [
    # HARDWARE ENGINEER (6)
    {"frame": "hardware engineer", "idea": "Pre-warm GPU pool with persistent Runway sessions + silent heartbeat audio packets", "rationale": "Keep sessions alive with minimal data traffic"},
    {"frame": "hardware engineer", "idea": "Pre-render Aria's idle loop as 10s WebM played locally while GPU boots", "rationale": "Mask cold start latency with cached local asset"},
    {"frame": "hardware engineer", "idea": "Offload wardrobe analysis to client-side MediaPipe/ONNX; send only keypoints + colors as text", "rationale": "Move compute to edge, reduce GPU load"},
    {"frame": "hardware engineer", "idea": "Pre-warm 3 Runway sessions via cron; rotate round-robin; recycle after 5min idle", "rationale": "Fixed pool size, predictable cost, session handoff"},
    {"frame": "hardware engineer", "idea": "Run MediaPipe BlazePose + EfficientNet in-browser via WebAssembly; send garment tags as JSON", "rationale": "WASM CV pipeline, text-only to Aria"},
    {"frame": "hardware engineer", "idea": "Pre-warm 2 persistent sessions on 4hr cron; WebRTC datachannel heartbeat; session handoff", "rationale": "Minimal pool with active keepalive"},

    # GAME DESIGN (6)
    {"frame": "game design", "idea": "Style Streak: daily 5-min \"fit check\" unlocks streak rewards (slots, items, cosmetics)", "rationale": "Daily retention loop with cosmetic progression"},
    {"frame": "game design", "idea": "Fit Check Speedrun: upload photo → 30s analysis → score + tip → leaderboard", "rationale": "Competitive micro-session with social proof"},
    {"frame": "game design", "idea": "Wardrobe Tamagotchi: Aria wears user's items; happiness decays if unworn; reminds to wear", "rationale": "Pet mechanic drives re-engagement with own wardrobe"},
    {"frame": "game design", "idea": "Fit Quest: weekly themed challenge → build outfit → Aria rates + 1 Amazon link → purchase = XP", "rationale": "Quest loop with affiliate monetization"},
    {"frame": "game design", "idea": "Save State/Replay: auto-save outfit+advice as \"Look Card\"; replay offline; shareable IG Story", "rationale": "Artifact creation + social sharing loop"},
    {"frame": "game design", "idea": "Aria's Wardrobe Shop: 1 Amazon link per session; affiliate tracks purchase; earn Style Credits", "rationale": "Single recommendation + affiliate revenue + currency"},

    # INVERSION (6)
    {"frame": "inversion", "idea": "Guarantee failure: video-only, 4K, $5/session → invert: audio-first, 720p@15fps optional, free tier 3/day", "rationale": "Lower fidelity, higher accessibility, free tier"},
    {"frame": "inversion", "idea": "Guarantee failure: require real-time video analysis or die → invert: client-side CV, Aria gets JSON", "rationale": "Push perception to edge, GPU only for generation"},
    {"frame": "inversion", "idea": "Guarantee failure: 100% uptime, zero latency, infinite GPU → invert: embrace 30s as \"thinking time\" + fixed credit budget", "rationale": "Reframe latency as feature, hard budget constraint"},
    {"frame": "inversion", "idea": "Guarantee failure: Aria's GPU does video analysis → invert: push ALL CV to client; Aria GPU = avatar+TTS only", "rationale": "Strict GPU role separation"},
    {"frame": "inversion", "idea": "Guarantee failure: general chatbot → invert: single-purpose \"Fit Check\" agent with 3 fixed intents", "rationale": "Narrow scope, deterministic, testable"},
    {"frame": "inversion", "idea": "Guarantee failure: build for scale from day 1 → invert: build for 1 judge laptop, 10 users, 1 warm GPU", "rationale": "Ruthless scope for hackathon context"},

    # $0 BUDGET / 1 HOUR (6)
    {"frame": "$0 budget / 1 hour", "idea": "Audio-only Aria via browser SpeechSynthesis + Web Speech API; localStorage wardrobe; zero Runway", "rationale": "Zero infra, browser-native TTS, local data"},
    {"frame": "$0 budget / 1 hour", "idea": "Static Aria PNG + browser TTS + client MediaPipe + localStorage; single HTML file → GitHub Pages", "rationale": "Deploy-free, single artifact, client-only"},
    {"frame": "$0 budget / 1 hour", "idea": "Discord bot: photo → local MediaPipe → GPT-4o-mini ($0.15/1M); Aria personality = system prompt", "rationale": "Discord distribution, cheap LLM, personality via prompt"},
    {"frame": "$0 budget / 1 hour", "idea": "Static site: drag-drop → MediaPipe tags → Mad Libs Aria responses → SpeechSynthesis", "rationale": "Template responses, zero LLM cost, browser TTS"},
    {"frame": "$0 budget / 1 hour", "idea": "Telegram bot: photo → local MediaPipe → GPT-4o-mini → reply; free Railway tier", "rationale": "Telegram reach, serverless hosting, cheap LLM"},
    {"frame": "$0 budget / 1 hour", "idea": "Single HTML: drag-drop → Transformers.js CLIP embeddings → cosine similarity → template advice → TTS", "rationale": "Client-side embeddings, similarity search, no API"},

    # BIOLOGY (6)
    {"frame": "biology", "idea": "Aria as immune system: wardrobe = pathogens; Aria = memory B-cells remembering bad fits", "rationale": "Adaptive memory of failures, antibody = good fit pattern"},
    {"frame": "biology", "idea": "Wardrobe as microbiome: diverse items = healthy; Aria = steward suggesting diversity; monoculture = dysbiosis", "rationale": "Diversity metric drives recommendations"},
    {"frame": "biology", "idea": "Neural plasticity: Aria strengthens \"style pathways\"; track \"decision latency\" as KPI", "rationale": "Learning curves, faster decisions = mastery"},
    {"frame": "biology", "idea": "Circadian style rhythm: Aria learns weekly rhythm; proactively suggests fits at right times", "rationale": "Temporal patterns, proactive not reactive"},
    {"frame": "biology", "idea": "Symbiotic relationship: user feeds data, Aria feeds confidence; compliments = social reward", "rationale": "Mutualistic loop, external validation as signal"},
    {"frame": "biology", "idea": "Evolutionary wardrobe: items have \"fitness\" (wear × compliments); low fitness = extinct; Aria = mutation/selection", "rationale": "Genetic algorithm on wardrobe, selection pressure"},
]

# Scoring function
def score_idea(idea):
    frame = idea["frame"]
    text = idea["idea"]
    
    scores = {}
    
    if frame == "hardware engineer":
        if "Pre-warm GPU pool" in text and "heartbeat audio" in text:
            scores = {"novelty": 7, "viability": 5, "fit": 4}
        elif "Pre-render Aria's idle loop" in text:
            scores = {"novelty": 6, "viability": 8, "fit": 5}
        elif "Offload wardrobe analysis to client-side" in text:
            scores = {"novelty": 8, "viability": 7, "fit": 8}
        elif "Pre-warm 3 Runway sessions via cron" in text:
            scores = {"novelty": 4, "viability": 6, "fit": 4}
        elif "Run MediaPipe BlazePose + EfficientNet in-browser via WebAssembly" in text:
            scores = {"novelty": 7, "viability": 6, "fit": 7}
        elif "Pre-warm 2 persistent sessions on 4hr cron" in text:
            scores = {"novelty": 3, "viability": 5, "fit": 3}
    
    elif frame == "game design":
        if "Style Streak" in text:
            scores = {"novelty": 5, "viability": 8, "fit": 9}
        elif "Fit Check Speedrun" in text:
            scores = {"novelty": 6, "viability": 7, "fit": 7}
        elif "Wardrobe Tamagotchi" in text:
            scores = {"novelty": 8, "viability": 7, "fit": 8}
        elif "Fit Quest" in text:
            scores = {"novelty": 6, "viability": 6, "fit": 7}
        elif "Save State/Replay" in text:
            scores = {"novelty": 7, "viability": 8, "fit": 8}
        elif "Aria's Wardrobe Shop" in text:
            scores = {"novelty": 4, "viability": 5, "fit": 5}
    
    elif frame == "inversion":
        if "audio-first, 720p@15fps optional, free tier 3/day" in text:
            scores = {"novelty": 7, "viability": 8, "fit": 8}
        elif "client-side CV, Aria gets JSON" in text:
            scores = {"novelty": 8, "viability": 8, "fit": 9}
        elif "embrace 30s as \"thinking time\" + fixed credit budget" in text:
            scores = {"novelty": 6, "viability": 9, "fit": 8}
        elif "push ALL CV to client; Aria GPU = avatar+TTS only" in text:
            scores = {"novelty": 7, "viability": 7, "fit": 8}
        elif "single-purpose \"Fit Check\" agent with 3 fixed intents" in text:
            scores = {"novelty": 5, "viability": 9, "fit": 7}
        elif "build for 1 judge laptop, 10 users, 1 warm GPU" in text:
            scores = {"novelty": 4, "viability": 10, "fit": 6}
    
    elif frame == "$0 budget / 1 hour":
        if "Audio-only Aria via browser SpeechSynthesis" in text:
            scores = {"novelty": 5, "viability": 9, "fit": 4}
        elif "Static Aria PNG + browser TTS + client MediaPipe + localStorage" in text:
            scores = {"novelty": 4, "viability": 10, "fit": 3}
        elif "Discord bot: photo → local MediaPipe → GPT-4o-mini" in text:
            scores = {"novelty": 4, "viability": 8, "fit": 5}
        elif "Static site: drag-drop → MediaPipe tags → Mad Libs Aria responses → SpeechSynthesis" in text:
            scores = {"novelty": 3, "viability": 9, "fit": 3}
        elif "Telegram bot: photo → local MediaPipe → GPT-4o-mini → reply; free Railway tier" in text:
            scores = {"novelty": 3, "viability": 8, "fit": 4}
        elif "Single HTML: drag-drop → Transformers.js CLIP embeddings → cosine similarity → template advice → TTS" in text:
            scores = {"novelty": 6, "viability": 7, "fit": 5}
    
    elif frame == "biology":
        if "Aria as immune system: wardrobe = pathogens" in text:
            scores = {"novelty": 8, "viability": 5, "fit": 6}
        elif "Wardrobe as microbiome: diverse items = healthy" in text:
            scores = {"novelty": 7, "viability": 7, "fit": 8}
        elif "Neural plasticity: Aria strengthens \"style pathways\"" in text:
            scores = {"novelty": 6, "viability": 6, "fit": 7}
        elif "Circadian style rhythm: Aria learns weekly rhythm" in text:
            scores = {"novelty": 7, "viability": 7, "fit": 9}
        elif "Symbiotic relationship: user feeds data, Aria feeds confidence" in text:
            scores = {"novelty": 5, "viability": 6, "fit": 7}
        elif "Evolutionary wardrobe: items have \"fitness\" (wear × compliments)" in text:
            scores = {"novelty": 8, "viability": 6, "fit": 8}
    
    return scores

# Calculate weighted scores
for idea in ideas:
    scores = score_idea(idea)
    idea["scores"] = scores
    weighted = scores["novelty"] * 0.35 + scores["viability"] * 0.40 + scores["fit"] * 0.25
    idea["weighted"] = round(weighted, 2)

# Flag traps
traps = []
for idea in ideas:
    text = idea["idea"]
    frame = idea["frame"]
    if frame == "hardware engineer" and "persistent Runway sessions" in text and "heartbeat audio" in text:
        traps.append({"frame": frame, "idea": text, "reason": "Runway API likely doesn't support persistent sessions with audio heartbeat; session management is opaque"})
    elif frame == "hardware engineer" and "Pre-warm 2 persistent sessions on 4hr cron" in text:
        traps.append({"frame": frame, "idea": text, "reason": "Marginal gain over simpler pooling; cron + WebRTC datachannel adds complexity"})
    elif frame == "game design" and "Aria's Wardrobe Shop" in text:
        traps.append({"frame": frame, "idea": text, "reason": "Single affiliate link/session won't drive retention; affiliate revenue requires volume"})
    elif frame == "inversion" and "build for 1 judge laptop, 10 users, 1 warm GPU" in text:
        traps.append({"frame": frame, "idea": text, "reason": "Optimizes for hackathon demo, not long-term product; technical debt if extended"})
    elif frame == "$0 budget / 1 hour" and "Static Aria PNG + browser TTS + client MediaPipe + localStorage" in text:
        traps.append({"frame": frame, "idea": text, "reason": "Zero server = zero persistence, zero personalization, zero moat; churn immediate"})
    elif frame == "biology" and "Aria as immune system: wardrobe = pathogens" in text:
        traps.append({"frame": frame, "idea": text, "reason": "Metaphor inverts value (wardrobe = bad); users won't understand; confusing mental model"})

# Sort by weighted score
ideas_sorted = sorted(ideas, key=lambda x: x["weighted"], reverse=True)

# Clustering
clusters = {
    "Client-side CV / Edge compute": [],
    "Latency masking / Session pooling": [],
    "Retention loops / Gamification": [],
    "Radical scope reduction / Inversion": [],
    "Zero-infra / Browser-only": [],
    "Biological metaphors / Adaptive systems": [],
}

for idea in ideas:
    text = idea["idea"]
    frame = idea["frame"]
    if "client-side" in text.lower() or "MediaPipe" in text or "WASM" in text or "WebAssembly" in text or "Transformers.js" in text or "CLIP" in text:
        clusters["Client-side CV / Edge compute"].append({"frame": frame, "idea": text})
    elif "pre-warm" in text.lower() or "persistent session" in text.lower() or "idle loop" in text.lower() or "heartbeat" in text.lower() or "cron" in text.lower():
        clusters["Latency masking / Session pooling"].append({"frame": frame, "idea": text})
    elif "streak" in text.lower() or "speedrun" in text.lower() or "tamagotchi" in text.lower() or "quest" in text.lower() or "save state" in text.lower() or "replay" in text.lower() or "shop" in text.lower() or "xp" in text.lower() or "cosmetic" in text.lower():
        clusters["Retention loops / Gamification"].append({"frame": frame, "idea": text})
    elif "invert" in text.lower() or "audio-first" in text.lower() or "30s" in text.lower() or "single-purpose" in text.lower() or "judge laptop" in text.lower():
        clusters["Radical scope reduction / Inversion"].append({"frame": frame, "idea": text})
    elif "browser SpeechSynthesis" in text or "single HTML" in text or "localStorage" in text or "Discord bot" in text or "Telegram bot" in text or "GitHub Pages" in text or "Railway" in text or "Mad Libs" in text:
        clusters["Zero-infra / Browser-only"].append({"frame": frame, "idea": text})
    elif "immune" in text.lower() or "microbiome" in text.lower() or "neural plasticity" in text.lower() or "circadian" in text.lower() or "symbiotic" in text.lower() or "evolutionary" in text.lower() or "fitness" in text.lower():
        clusters["Biological metaphors / Adaptive systems"].append({"frame": frame, "idea": text})

# Top 3 (excluding traps)
trap_texts = {t["idea"] for t in traps}
top3 = [i for i in ideas_sorted if i["idea"] not in trap_texts"]][:3]

output = {
    "scored": [
        {
            "frame": i["frame"],
            "idea": i["idea"],
            "rationale": i["rationale"],
            "scores": i["scores"],
            "trap": next((t["reason"] for t in traps if t["idea"] == i["idea"]), "")
        }
        for i in ideas_sorted
    ],
    "clusters": [
        {"angle": angle, "ideas": ideas_list}
        for angle, ideas_list in clusters.items()
        if ideas_list
    ],
    "top3": [
        {
            "sketch": "",
            "risk": "",
            "first_step": "",
            "children": []
        }
        for _ in top3
    ]
}

# Deepen top 3 manually
top3_sketches = [
    {
        "sketch": "Move all computer vision (pose detection, garment segmentation, color extraction) to the client using MediaPipe + ONNX models running in WebAssembly. The browser sends only structured JSON (keypoints, dominant colors, garment bounding boxes, CLIP embeddings) to Aria's backend. Aria's GPU never sees pixels — it only receives semantic descriptors and generates avatar video + TTS. This flips the architecture: client = perception, server = generation. Runway sessions become pure video generation endpoints, drastically reducing GPU time per request and enabling a free tier.",
        "risk": "WASM model size (50-100MB) hurts cold start; MediaPipe garment segmentation quality on diverse photos is unproven; user device variance (mobile vs desktop) creates inconsistent perception quality.",
        "first_step": "Prototype MediaPipe BlazePose + EfficientNet-B0 in Transformers.js; measure WASM load time, inference latency, and output quality on 50 diverse wardrobe photos across mobile/desktop.",
        "children": [
            "Hybrid: client does pose + dominant color; server does garment isolation via Runway gen4_image_turbo",
            "Cache CLIP embeddings locally; only send delta when wardrobe changes",
            "Federated: aggregate anonymous embedding statistics to improve base models without uploading photos",
            "Fallback chain: WASM → server-side rembg → Runway cleaner (escalating cost/quality)"
        ]
    },
    {
        "sketch": "Reframe the 30-second Runway generation latency as \"Aria's thinking time\" — a deliberate, branded pause where Aria visibly considers the outfit. Show her avatar pondering (tapping chin, scrolling through mental wardrobe) with a progress ring. Pair this with a hard credit budget (e.g., 50 credits/day per user) that forces efficiency: gen4_image_turbo for exploration, gen4.5 video only for \"final look\". Users get 3 free video generations/day; extra credits earnable via streaks, shares, or affiliate purchases. The constraint becomes a game mechanic, not a limitation.",
        "risk": "Users may perceive \"thinking time\" as broken/slow if not delightfully animated; credit budget feels restrictive if not balanced with earn rates; Runway credit costs may shift breaking the economy.",
        "first_step": "Design the \"thinking\" animation states (idle → ponder → decide → generate) in Figma; implement as Framer Motion states driven by Runway task status webhook; A/B test perceived speed vs actual speed with 10 users.",
        "children": [
            "\"Speedrun mode\": skip thinking animation, use turbo only, 1 credit — for power users",
            "Credit gifting: friends can donate credits; social pressure to engage",
            "Dynamic pricing: off-peak hours = half credits; shifts load naturally",
            "Stylized avatar generation as \"premium\" spend (100 credits) — the ramp video"
        ]
    },
    {
        "sketch": "Build a Tamagotchi-style wardrobe companion where Aria 'wears' items from the user's closet. Each item has a happiness meter that decays if unworn for 7+ days. Aria sends proactive notifications: \"Your blue silk shirt misses you — perfect for Tuesday's dinner.\" Wearing an item (confirmed via selfie try-on or manual log) restores happiness and grants Style XP. XP unlocks cosmetic Aria outfits, background scenes, and extra video credits. The wardrobe becomes a living collection the user stewards, not a static database. Retention comes from emotional attachment + loss aversion.",
        "risk": "Notification fatigue if too aggressive; 'happiness' metaphor may feel childish for target demographic; requires reliable wear detection (selfie try-on or manual) which adds friction.",
        "first_step": "Add `last_worn_at` and `happiness` fields to wardrobe_items table; build background job that decays happiness daily and triggers push notifications; design Aria 'wearing user item' visual state in Studio.",
        "children": [
            "Seasonal moods: Aria's wardrobe desires shift with weather/calendar (coats in winter, dresses for weddings)",
            "Item evolution: frequently worn items 'level up' — unlock backstory, fabric details, care tips",
            "Social: friends can 'borrow' items (virtual); Aria mediates; builds social graph",
            "Microbiome angle: diversity score = wardrobe health; low diversity = Aria suggests gaps (e.g., 'you need a neutral blazer')"
        ]
    }
]

for i, sketch in enumerate(top3_sketches):
    output["top3"][i].update(sketch)

print(json.dumps(output, indent=2))