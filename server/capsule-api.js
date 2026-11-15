import express, { Router } from 'express';
import { validateCapsule } from './capsule-validation.js';

function asJson(capsule) {
  return { ...capsule, reviewed: capsule.reviewed === 1, improved: capsule.improved === 1 };
}

function validateId(req, res, next) {
  const id = Number(req.params.id);
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(id)) {
    return res.status(400).json({ error: 'Capsule ID must be a positive safe integer.' });
  }
  req.capsuleId = id;
  next();
}

function validateBody(req, res, next) {
  const { fields, errors } = validateCapsule(req.body);
  if (errors.length) return res.status(400).json({ error: 'Invalid capsule.', details: errors });
  req.capsuleFields = fields;
  next();
}

export function createCapsuleApi({ storage, requireUser, appOrigin }) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  // Authenticate before CSRF checks and JSON parsing so unauthenticated calls get 401.
  router.use(requireUser);
  router.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.get('origin') !== appOrigin) {
      return res.status(403).json({ error: 'A same-origin request is required.' });
    }
    next();
  });

  const jsonBody = express.json({ limit: '128kb' });
  router.get('/', async (req, res) => {
    res.json({ capsules: (await storage.list(req.user.id)).map(asJson) });
  });
  router.post('/', jsonBody, validateBody, async (req, res) => {
    const capsule = await storage.create(req.user.id, req.capsuleFields);
    res.status(201).json({ capsule: asJson(capsule) });
  });
  router.put('/:id', validateId, jsonBody, validateBody, async (req, res) => {
    const capsule = await storage.update(req.user.id, req.capsuleId, req.capsuleFields);
    if (!capsule) return res.status(404).json({ error: 'Capsule not found.' });
    res.json({ capsule: asJson(capsule) });
  });
  router.delete('/:id', validateId, jsonBody, async (req, res) => {
    if (req.body !== undefined || Number(req.get('content-length')) > 0 || req.get('transfer-encoding')) {
      return res.status(400).json({ error: 'DELETE requests must not include a body.' });
    }
    if (!await storage.delete(req.user.id, req.capsuleId)) {
      return res.status(404).json({ error: 'Capsule not found.' });
    }
    res.status(204).end();
  });
  return router;
}
