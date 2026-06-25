import json, os

ROOT = r"C:/Users/VVV/Desktop/SaaS"
INP = os.path.join(ROOT, ".understand-anything/tmp/arch-input.json")
OUT = os.path.join(ROOT, ".understand-anything/intermediate/layers.json")

with open(INP, "r", encoding="utf-8") as f:
    data = json.load(f)

nodes = data["fileNodes"]

def fp(n):
    return n.get("filePath") or n["id"].split(":", 1)[-1]

# layer buckets
layers = {
    "frontend": [],
    "backend-api": [],
    "backend-services": [],
    "workers-queues": [],
    "data-persistence": [],
    "infra-ci": [],
    "documentation": [],
    "design-system": [],
}

# explicit overrides by id (after we inspect)
override = {}

unassigned = []

for n in nodes:
    nid = n["id"]
    path = fp(n).replace("\\", "/")
    ntype = n["type"]
    tags = set(n.get("tags") or [])
    low = path.lower()

    if nid in override:
        layers[override[nid]].append(nid)
        continue

    # Design app (self-contained: code + its own docs/configs)
    if path.startswith("Design Front End UI_UX/"):
        layers["design-system"].append(nid)
        continue

    # Documentation (markdown + UI-prompt text docs, anywhere outside the design app)
    if ntype == "document" or low.endswith(".md"):
        layers["documentation"].append(nid)
        continue

    # Root-level SQL table / schema -> data & persistence
    if ntype in ("table", "schema") or low.endswith(".sql"):
        layers["data-persistence"].append(nid)
        continue

    # Frontend (Next.js)
    if path.startswith("frontend/"):
        # frontend Dockerfile / dockerignore -> infra
        if "dockerfile" in low or "dockerignore" in low:
            layers["infra-ci"].append(nid)
        else:
            layers["frontend"].append(nid)
        continue

    # Backend
    if path.startswith("backend/"):
        if "dockerfile" in low or "dockerignore" in low:
            layers["infra-ci"].append(nid)
            continue
        # prisma schema / migrations / tables / lockfile
        if "prisma" in low or ntype in ("table", "schema") or "/migrations/" in low:
            layers["data-persistence"].append(nid)
            continue
        # backend build/runtime config that lives at the package root (not src/config)
        backend_rel = low[len("backend/"):]
        if "/" not in backend_rel or backend_rel.startswith(".") :
            # e.g. backend/package.json, tsconfig.json, Procfile, .env.example, .gitignore
            layers["infra-ci"].append(nid)
            continue
        if "/config/db" in low:
            layers["data-persistence"].append(nid)
            continue
        if "/workers/" in low or "/queues/" in low:
            layers["workers-queues"].append(nid)
            continue
        if "/routes/" in low or low.endswith("/server.ts") or "/middleware/" in low:
            layers["backend-api"].append(nid)
            continue
        if "/services/" in low:
            layers["backend-services"].append(nid)
            continue
        if "/config/" in low:
            # secrets/config -> backend services (shared config) ; but db handled above
            layers["backend-services"].append(nid)
            continue
        # leftover backend (test-prisma, etc.)
        if "test-prisma" in low or ntype in ("schema","table"):
            layers["data-persistence"].append(nid)
            continue
        layers["backend-services"].append(nid)
        continue

    # root-level infra/config
    if (ntype in ("config", "service")) or "dockerfile" in low or "docker-compose" in low \
       or low.endswith(".yml") or low.endswith(".yaml") or ".github/" in low \
       or low.endswith(".dockerignore"):
        layers["infra-ci"].append(nid)
        continue

    unassigned.append((nid, ntype, path))

print("UNASSIGNED:", len(unassigned))
for u in unassigned:
    print("  ", u)

# Build output
meta = {
    "frontend": ("layer:frontend", "Frontend (Next.js App Router)",
        "Next.js App Router pages, route segments, React components, client-side providers/hooks, and the frontend API client that make up the user-facing web application."),
    "backend-api": ("layer:backend-api", "Backend API & Routes",
        "Express HTTP layer: the server bootstrap, route handlers (auth, outbound, email, inbox, domains, settings, watchlist), and request middleware (auth, rate limiting) that expose the platform's REST API."),
    "backend-services": ("layer:backend-services", "Backend Services (Lead-gen, AI, Outbound & Email)",
        "Core domain/business logic services: lead generation and crawling, AI scoring and email generation, outbound campaign engine, email verification/deliverability, inbox sync, SMTP transport, and shared backend config/secrets."),
    "workers-queues": ("layer:workers-queues", "Background Workers & Queues",
        "BullMQ/Redis background processing: queue definitions and the worker entry point that drive the asynchronous scraping, outbound-send, and verification pipelines."),
    "data-persistence": ("layer:data-persistence", "Data & Persistence",
        "Prisma schema, SQL migrations and table definitions, the shared Prisma client singleton, and database diagnostic scripts backing PostgreSQL persistence."),
    "infra-ci": ("layer:infra-ci", "Infrastructure & CI",
        "Containerization and delivery: Dockerfiles and build stages, .dockerignore files, docker-compose, and GitHub Actions CI workflows."),
    "documentation": ("layer:documentation", "Documentation",
        "Markdown documentation: README, architecture/crawler/deployment guides, audit reports, and other project reference docs."),
    "design-system": ("layer:design-system", "Design System / Mockups",
        "The standalone Vite/React Figma design-mockup app and its shadcn/ui design-system kit, used for UI/UX prototyping separately from the production frontend."),
}

out = {"layers": []}
total = 0
for key, ids in layers.items():
    lid, name, desc = meta[key]
    out["layers"].append({"id": lid, "name": name, "description": desc, "nodeIds": ids})
    total += len(ids)
    print(f"{name}: {len(ids)}")

print("TOTAL assigned:", total, "of", len(nodes))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out["layers"], f, ensure_ascii=False, indent=2)
print("WROTE", OUT)
