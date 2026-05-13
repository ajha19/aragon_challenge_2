import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mediaRoutes from './routes/media.routes';
import logger from '../core/services/logger';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { conversionQueue, compressionQueue, variantQueue } from '../core/queue/config';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup BullBoard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [
    new BullMQAdapter(conversionQueue),
    new BullMQAdapter(compressionQueue),
    new BullMQAdapter(variantQueue),
  ],
  serverAdapter: serverAdapter,
});

app.use(cors());
app.use(express.json());
app.use('/admin/queues', serverAdapter.getRouter());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/v1/media', mediaRoutes);

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

export default app;
