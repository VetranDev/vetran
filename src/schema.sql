-- ============================================================
--  VETRAN DATABASE SCHEMA
--  Run this once against your Postgres instance
-- ============================================================

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  agent_id          VARCHAR(32)   PRIMARY KEY,
  name              VARCHAR(255)  NOT NULL,
  owner             VARCHAR(255)  NOT NULL,
  model             VARCHAR(255)  DEFAULT 'unspecified',
  description       TEXT          DEFAULT '',
  capabilities      JSONB         DEFAULT '[]',
  status            VARCHAR(20)   DEFAULT 'ACTIVE'  CHECK (status IN ('ACTIVE','REVOKED')),
  vetran_score      INTEGER       DEFAULT 100,
  badge             VARCHAR(20)   DEFAULT 'ROOKIE'  CHECK (badge IN ('ROOKIE','ACTIVE','ELITE')),
  registered_at     TIMESTAMPTZ   DEFAULT NOW(),
  last_verified_at  TIMESTAMPTZ,
  verification_count INTEGER      DEFAULT 0,
  revoked_at        TIMESTAMPTZ,
  revoke_reason     TEXT,
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- Delegations table
CREATE TABLE IF NOT EXISTS delegations (
  delegation_id       VARCHAR(32)   PRIMARY KEY,
  parent_agent_id     VARCHAR(32)   NOT NULL REFERENCES agents(agent_id),
  child_agent_id      VARCHAR(32)   NOT NULL REFERENCES agents(agent_id),
  scoped_capabilities JSONB         DEFAULT '[]',
  delegation_token    TEXT          NOT NULL,
  expires_in          VARCHAR(20)   DEFAULT '24h',
  created_at          TIMESTAMPTZ   DEFAULT NOW()
);

-- Verification log (audit trail)
CREATE TABLE IF NOT EXISTS verification_log (
  id                  BIGSERIAL     PRIMARY KEY,
  agent_id            VARCHAR(32)   NOT NULL REFERENCES agents(agent_id),
  verified            BOOLEAN       NOT NULL,
  cleared_to_execute  BOOLEAN       NOT NULL,
  requested_caps      JSONB         DEFAULT '[]',
  missing_caps        JSONB         DEFAULT '[]',
  verified_at         TIMESTAMPTZ   DEFAULT NOW(),
  ip_address          VARCHAR(45)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_agents_owner     ON agents(owner);
CREATE INDEX IF NOT EXISTS idx_agents_status    ON agents(status);
CREATE INDEX IF NOT EXISTS idx_delegations_parent ON delegations(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_delegations_child  ON delegations(child_agent_id);
CREATE INDEX IF NOT EXISTS idx_verlog_agent     ON verification_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_verlog_time      ON verification_log(verified_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
