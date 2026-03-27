require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'vetran-dev-secret-change-in-prod';
const PORT = process.env.PORT || 3000;

// ─── In-memory store (replace with DB in production) ─────────────────────────
const agents = {};       // agentId -> agent record
const delegations = {};  // delegationId -> delegation record

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString();
}

function vetranBadge(agent) {
  const age = Date.now() - new Date(agent.registeredAt).getTime();
  const daysSinceRegistration = Math.floor(age / (1000 * 60 * 60 * 24));
  const verificationCount = agent.verificationCount || 0;

  if (verificationCount > 100 && daysSinceRegistration > 30) return 'ELITE';
  if (verificationCount > 10) return 'ACTIVE';
  return 'ROOKIE';
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'Vetran',
    tagline: 'Trust infrastructure for AI agents',
    version: '1.0.0',
    status: 'operational',
    endpoints: ['/register', '/verify', '/delegate', '/status/:agentId', '/revoke/:agentId']
  });
});

// ─── POST /register ────────────────────────────────────────────────────────
// Register a new agent and receive a signed identity token
app.post('/register', (req, res) => {
  const { name, owner, capabilities, model, description } = req.body;

  if (!name || !owner) {
    return res.status(400).json({
      error: 'MISSING_FIELDS',
      message: 'name and owner are required'
    });
  }

  const agentId = `agt_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

  const agent = {
    agentId,
    name,
    owner,
    model: model || 'unspecified',
    description: description || '',
    capabilities: capabilities || [],
    status: 'ACTIVE',
    vetranScore: 100,
    badge: 'ROOKIE',
    registeredAt: timestamp(),
    lastVerifiedAt: null,
    verificationCount: 0,
    delegations: []
  };

  agents[agentId] = agent;

  // Issue signed identity token
  const token = jwt.sign(
    {
      agentId,
      name,
      owner,
      capabilities: capabilities || [],
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  console.log(`[VETRAN] Agent registered: ${agentId} (${name}) by ${owner}`);

  res.status(201).json({
    success: true,
    message: `Agent "${name}" is now Vetran-registered`,
    agentId,
    token,
    agent: {
      agentId: agent.agentId,
      name: agent.name,
      owner: agent.owner,
      capabilities: agent.capabilities,
      status: agent.status,
      badge: agent.badge,
      registeredAt: agent.registeredAt
    }
  });
});

// ─── POST /verify ──────────────────────────────────────────────────────────
// Verify an agent's identity token and return trust assessment
app.post('/verify', (req, res) => {
  const { token, requestedCapabilities } = req.body;

  if (!token) {
    return res.status(400).json({
      error: 'MISSING_TOKEN',
      message: 'token is required'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      verified: false,
      error: 'INVALID_TOKEN',
      message: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Token is invalid or tampered',
      clearedToExecute: false
    });
  }

  const agent = agents[decoded.agentId];
  if (!agent) {
    return res.status(404).json({
      verified: false,
      error: 'AGENT_NOT_FOUND',
      message: 'Agent not found in Vetran registry',
      clearedToExecute: false
    });
  }

  if (agent.status === 'REVOKED') {
    return res.status(403).json({
      verified: false,
      error: 'AGENT_REVOKED',
      message: 'This agent has been revoked and is not cleared to execute',
      clearedToExecute: false,
      revokedAt: agent.revokedAt
    });
  }

  // Check requested capabilities
  let capabilityCheck = { passed: true, missing: [] };
  if (requestedCapabilities && requestedCapabilities.length > 0) {
    const missing = requestedCapabilities.filter(
      cap => !agent.capabilities.includes(cap)
    );
    if (missing.length > 0) {
      capabilityCheck = { passed: false, missing };
    }
  }

  // Update verification stats
  agent.verificationCount += 1;
  agent.lastVerifiedAt = timestamp();
  agent.badge = vetranBadge(agent);

  console.log(`[VETRAN] Agent verified: ${agent.agentId} (${agent.name}) — cleared: ${capabilityCheck.passed}`);

  res.json({
    verified: true,
    clearedToExecute: capabilityCheck.passed,
    agent: {
      agentId: agent.agentId,
      name: agent.name,
      owner: agent.owner,
      status: agent.status,
      badge: agent.badge,
      vetranScore: agent.vetranScore,
      capabilities: agent.capabilities,
      verificationCount: agent.verificationCount,
      registeredAt: agent.registeredAt,
      lastVerifiedAt: agent.lastVerifiedAt
    },
    capabilityCheck,
    verifiedAt: timestamp()
  });
});

// ─── POST /delegate ────────────────────────────────────────────────────────
// Agent A delegates trust to Agent B with scoped permissions
app.post('/delegate', (req, res) => {
  const { parentToken, childAgentId, scopedCapabilities, expiresIn } = req.body;

  if (!parentToken || !childAgentId) {
    return res.status(400).json({
      error: 'MISSING_FIELDS',
      message: 'parentToken and childAgentId are required'
    });
  }

  // Verify parent
  let parentDecoded;
  try {
    parentDecoded = jwt.verify(parentToken, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      error: 'INVALID_PARENT_TOKEN',
      message: 'Parent agent token is invalid or expired'
    });
  }

  const parentAgent = agents[parentDecoded.agentId];
  const childAgent = agents[childAgentId];

  if (!parentAgent) {
    return res.status(404).json({ error: 'PARENT_NOT_FOUND' });
  }
  if (!childAgent) {
    return res.status(404).json({ error: 'CHILD_NOT_FOUND', message: 'Child agent not found in Vetran registry' });
  }
  if (parentAgent.status === 'REVOKED') {
    return res.status(403).json({ error: 'PARENT_REVOKED', message: 'Revoked agents cannot delegate trust' });
  }

  // Scoped capabilities must be subset of parent's capabilities
  const allowedCaps = scopedCapabilities
    ? scopedCapabilities.filter(cap => parentAgent.capabilities.includes(cap))
    : parentAgent.capabilities;

  const delegationId = `del_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const ttl = expiresIn || '24h';

  const delegationToken = jwt.sign(
    {
      delegationId,
      parentAgentId: parentAgent.agentId,
      childAgentId: childAgent.agentId,
      scopedCapabilities: allowedCaps,
      chain: [...(parentDecoded.chain || []), parentAgent.agentId]
    },
    JWT_SECRET,
    { expiresIn: ttl }
  );

  const delegation = {
    delegationId,
    parentAgentId: parentAgent.agentId,
    childAgentId: childAgent.agentId,
    scopedCapabilities: allowedCaps,
    createdAt: timestamp(),
    expiresIn: ttl,
    token: delegationToken
  };

  delegations[delegationId] = delegation;
  parentAgent.delegations.push(delegationId);

  console.log(`[VETRAN] Delegation issued: ${parentAgent.agentId} → ${childAgent.agentId}`);

  res.status(201).json({
    success: true,
    message: `Trust delegated from "${parentAgent.name}" to "${childAgent.name}"`,
    delegationId,
    delegationToken,
    chain: [...(parentDecoded.chain || []), parentAgent.agentId, childAgent.agentId],
    scopedCapabilities: allowedCaps,
    expiresIn: ttl
  });
});

// ─── GET /status/:agentId ──────────────────────────────────────────────────
// Get current standing of an agent in the Vetran registry
app.get('/status/:agentId', (req, res) => {
  const agent = agents[req.params.agentId];

  if (!agent) {
    return res.status(404).json({
      error: 'AGENT_NOT_FOUND',
      message: `No agent found with ID: ${req.params.agentId}`
    });
  }

  res.json({
    agentId: agent.agentId,
    name: agent.name,
    owner: agent.owner,
    status: agent.status,
    badge: agent.badge,
    vetranScore: agent.vetranScore,
    capabilities: agent.capabilities,
    verificationCount: agent.verificationCount,
    registeredAt: agent.registeredAt,
    lastVerifiedAt: agent.lastVerifiedAt,
    delegationCount: agent.delegations.length
  });
});

// ─── POST /revoke/:agentId ─────────────────────────────────────────────────
// Revoke an agent — immediately blocks all future verifications
app.post('/revoke/:agentId', (req, res) => {
  const { ownerToken, reason } = req.body;
  const agent = agents[req.params.agentId];

  if (!agent) {
    return res.status(404).json({ error: 'AGENT_NOT_FOUND' });
  }

  agent.status = 'REVOKED';
  agent.revokedAt = timestamp();
  agent.revokeReason = reason || 'No reason provided';

  console.log(`[VETRAN] Agent REVOKED: ${agent.agentId} (${agent.name}) — ${agent.revokeReason}`);

  res.json({
    success: true,
    message: `Agent "${agent.name}" has been revoked and is no longer cleared to execute`,
    agentId: agent.agentId,
    revokedAt: agent.revokedAt,
    reason: agent.revokeReason
  });
});

// ─── Start server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ██╗   ██╗███████╗████████╗██████╗  █████╗ ███╗   ██╗
  ██║   ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║
  ██║   ██║█████╗     ██║   ██████╔╝███████║██╔██╗ ██║
  ╚██╗ ██╔╝██╔══╝     ██║   ██╔══██╗██╔══██║██║╚██╗██║
   ╚████╔╝ ███████╗   ██║   ██║  ██║██║  ██║██║ ╚████║
    ╚═══╝  ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
                                                        
  Trust infrastructure for AI agents.
  Running on port ${PORT}
  `);
});

module.exports = app;
