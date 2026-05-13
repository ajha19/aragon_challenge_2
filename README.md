# Media Processing Pipeline

An asynchronous queue-driven processing pipeline using Node.js, BullMQ, Redis, and Sharp.

## Features
- **Choreography-based Workflow**: Three isolated workers (Conversion, Compression, Variant).
- **Durable Processing**: Redis-backed persistence and retry orchestration via BullMQ.
- **Idempotency**: Deterministic asset keys and status-aware guards.
- **Observability**: Granular status tracking and visual queue monitoring with BullBoard.
- **Metrics**: Automated tracking of compression ratios and output sizes.

## Tech Stack
- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **Database**: PostgreSQL + Prisma
- **Queue**: BullMQ + Redis
- **Image Processing**: Sharp
- **Storage**: Cloudinary

## Quickstart

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Setup**:
   Copy `.env` and fill in your Cloudinary and Database credentials.
   ```bash
   cp .env.example .env
   ```

3. **Database Migration**:
   ```bash
   npx prisma migrate dev
   ```

4. **Start API**:
   ```bash
   npm run dev
   ```

5. **Start Workers**:
   ```bash
   npm run worker:all
   ```

6. **Monitor Queues**:
   Visit `http://localhost:3000/admin/queues`

## API Endpoints

- `POST /v1/media/upload`: Upload an image (supports HEIC/JPEG/PNG).
- `GET /v1/media/:id/status`: Poll for processing status and variant URLs.
- `POST /v1/media/:id/reprocess`: Safely restart the pipeline for a specific asset.

## Architecture

The system uses a linear pipeline:
1. **Conversion**: Normalizes to optimized WebP.
2. **Compression**: Applies optimization and records metrics.
3. **Variant Generation**: Creates Thumbnail, Web, and Full resolutions.

All workers are stateless and can be scaled horizontally.
