<h1 align="center">🦷 PerioKit — Backend</h1>

<p align="center">
  <b>GraphQL API and data layer for PerioKit</b>, a periodontal charting web app<br />
  built for the Prosthodontics Department, Faculty of Dentistry, Chiang Mai University.
</p>

<p align="center">
  <a href="https://github.com/Siwali/periokit-senior-project-frontend">
    <img src="https://img.shields.io/badge/Frontend_Repo-181717?style=for-the-badge&logo=github&logoColor=white" />
  </a>
  <a href="https://periokit.netlify.app">
    <img src="https://img.shields.io/badge/🔗_Live_Demo-2563EB?style=for-the-badge" />
  </a>
  <img src="https://img.shields.io/badge/status-in_development-F59E0B?style=for-the-badge" />
</p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=nodejs,ts,graphql,prisma,supabase,postgres&perline=6" />
</p>

---

## What this does

Serves the GraphQL API behind PerioKit and owns the data model for periodontal records.

The domain is deeper than it looks: a single periodontal chart holds **6 measurement points per
tooth across up to 32 teeth**, recorded fresh at every visit — so the schema has to keep thousands
of measurements per patient queryable and comparable across time without collapsing into a blob.

**Responsibilities**

- 📐 Data modeling for patients, visits, teeth, and per-site measurements
- 🔍 GraphQL schema and resolvers serving the charting UI
- 🧮 Periodontal index calculation from raw measurement data
- 🗄️ Prisma schema and migrations against Supabase PostgreSQL

---

## Tech stack

**Runtime** — Node.js · TypeScript
**API** — GraphQL
**ORM** — Prisma
**Database** — Supabase (PostgreSQL)
**Hosting** — Render (demo) → Docker on Azure (planned)

---

## Data model

<!-- ใส่รูป ERD ตรงนี้ถ้ามี — จุดขายใหญ่ เพราะโชว์ทักษะ data modeling -->

```
Patient ──< Visit ──< ToothRecord ──< MeasurementPoint
                                      (pocket depth, recession,
                                       bleeding, mobility)
```

See [`prisma/schema.prisma`](prisma/schema.prisma) for the full schema.

---

## Running locally

```bash
git clone https://github.com/Siwali/periokit-senior-project-backend.git
cd periokit-senior-project-backend

npm install
cp .env.example .env      # add your Supabase connection string

npx prisma migrate dev
npm run dev
```

---

## ⚠️ Note on the demo

Hosted on a free Render instance that spins down when idle —
**the first request takes 1–2 minutes** while the service wakes up.
Production will run in Docker on Azure.

---

## About this project

Two-person senior project with a real client — the Prosthodontics Department at CMU's
Faculty of Dentistry. Actively in development.

---

<sub>No real patient data is stored in this repository. All demo data is synthetic.</sub>
