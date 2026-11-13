import express from 'express';

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`AI Capsule API is running on http://localhost:${port}`);
});
